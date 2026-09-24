"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { logServerError } from "@/shared/logging/server-error";
import type { DashboardActionState } from "./dashboard";

export async function completeDashboardItemAction(
  _state: DashboardActionState,
  form: FormData,
): Promise<DashboardActionState> {
  try {
    const actor = await getCurrentActor();
    const input = z
      .object({ sourceType: z.enum(["task", "assessment", "interview", "interview_review"]), itemId: z.uuid() })
      .parse({
        sourceType: form.get("sourceType"),
        itemId: form.get("itemId"),
      });
    const workflow = getJobWorkflow();
    const idempotencyKey = `dashboard:${input.sourceType}:${input.itemId}:complete`;
    const completedAt = new Date().toISOString();
    const result =
      input.sourceType === "interview"
        ? await workflow.execute({ type: "confirm_interview_occurred", interviewId: input.itemId, occurredAt: completedAt, idempotencyKey }, actor)
        : input.sourceType === "interview_review"
        ? await workflow.execute({ type: "complete_interview_review", interviewId: input.itemId, reviewedAt: completedAt, idempotencyKey }, actor)
        : input.sourceType === "assessment"
        ? await workflow.execute(
            {
              type: "complete_assessment",
              assessmentId: input.itemId,
              completedAt,
              idempotencyKey,
            },
            actor,
          )
        : await workflow.execute(
            {
              type: "complete_task",
              taskId: input.itemId,
              completedAt,
              idempotencyKey,
            },
            actor,
          );
    const jobTrackId =
      "assessment" in result
        ? result.assessment.jobTrackId
        : "interview" in result ? result.interview.jobTrackId : result.task.jobTrackId;
    revalidatePath("/");
    revalidatePath("/jobs");
    revalidatePath("/calendar");
    revalidatePath("/quick");
    revalidatePath("/interviews/[id]", "page");
    if (jobTrackId) revalidatePath(`/jobs/${jobTrackId}`);
    return {
      error: null,
      success:
        input.sourceType === "interview" ? "面试已完成。" : input.sourceType === "interview_review" ? "面试复盘已完成。" : input.sourceType === "assessment" ? "测评已完成。" : "待办已完成。",
    };
  } catch (error) {
    logServerError("Dashboard completion failed", error);
    return {
      error:
        error instanceof z.ZodError
          ? "无法识别这项操作，请刷新后重试。"
          : "未能完成该事项，请刷新后重试。",
      success: null,
    };
  }
}
