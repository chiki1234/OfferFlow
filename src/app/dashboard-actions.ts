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
      .object({ sourceType: z.enum(["task", "assessment"]), itemId: z.uuid() })
      .parse({
        sourceType: form.get("sourceType"),
        itemId: form.get("itemId"),
      });
    const workflow = getJobWorkflow();
    const idempotencyKey = `dashboard:${input.sourceType}:${input.itemId}:complete`;
    const completedAt = new Date().toISOString();
    const result =
      input.sourceType === "assessment"
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
        : result.task.jobTrackId;
    revalidatePath("/");
    revalidatePath("/jobs");
    revalidatePath("/calendar");
    revalidatePath("/quick");
    revalidatePath("/interviews/[id]", "page");
    if (jobTrackId) revalidatePath(`/jobs/${jobTrackId}`);
    return {
      error: null,
      success:
        input.sourceType === "assessment" ? "测评已完成。" : "待办已完成。",
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
