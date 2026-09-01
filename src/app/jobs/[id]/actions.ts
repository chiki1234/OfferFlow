"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { uploadResumeVersion } from "@/modules/resume-library/service";
import { getCurrentActor } from "@/shared/actor/current-actor";

export type JobDetailActionState = { error: string | null; success: string | null };

const baseSchema = z.object({
  intent: z.enum(["submit", "assessment", "interview", "task", "complete_task", "complete_assessment", "cancel_interview", "complete_interview_review", "record_rejection", "end_job_track", "upload_resume"]),
  idempotencyKey: z.string().min(8),
  jobTrackId: z.uuid(),
});

export async function jobDetailAction(
  _previousState: JobDetailActionState,
  formData: FormData,
): Promise<JobDetailActionState> {
  const base = baseSchema.safeParse({
    intent: formData.get("intent"),
    idempotencyKey: formData.get("idempotencyKey"),
    jobTrackId: formData.get("jobTrackId"),
  });
  if (!base.success) return { error: "请刷新页面后重试。", success: null };

  try {
    const workflow = getJobWorkflow();
    const actor = getCurrentActor();
    switch (base.data.intent) {
      case "upload_resume": {
        const file = formData.get("resumeFile");
        if (!(file instanceof File)) return { error: "请选择简历文件。", success: null };
        await uploadResumeVersion({
          userId: actor.userId,
          file,
          name: z.string().trim().max(255).optional().parse(formData.get("resumeName") || undefined),
        });
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "简历版本已上传。" };
      }
      case "submit": {
        const data = z.object({ resumeId: z.uuid(), submittedAt: z.string().min(1) }).parse({
          resumeId: formData.get("resumeId"), submittedAt: formData.get("submittedAt"),
        });
        await workflow.execute({
          type: "submit_application",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          resumeId: data.resumeId,
          submittedAt: toIso(data.submittedAt),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "已记录投递。" };
      }
      case "assessment": {
        const data = z.object({
          assessmentKind: z.enum(["assessment", "written_test"]),
          title: z.string().trim().min(1).max(255),
          deadlineAt: z.string().min(1),
          receivedAt: z.string().min(1),
        }).parse({
          assessmentKind: formData.get("assessmentKind"), title: formData.get("title"),
          deadlineAt: formData.get("deadlineAt"), receivedAt: formData.get("receivedAt"),
        });
        await workflow.execute({
          type: "record_assessment_invite",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          assessmentKind: data.assessmentKind,
          title: data.title,
          timing: { type: "deadline", deadlineAt: toIso(data.deadlineAt) },
          receivedAt: toIso(data.receivedAt),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "已记录测评并创建待办。" };
      }
      case "interview": {
        const data = z.object({
          roundLabel: z.string().trim().min(1).max(255),
          interviewType: z.string().trim().min(1).max(255),
          startAt: z.string().min(1), endAt: z.string().min(1), receivedAt: z.string().min(1),
          meetingUrl: z.union([z.url(), z.literal("")]),
        }).parse({
          roundLabel: formData.get("roundLabel"), interviewType: formData.get("interviewType"),
          startAt: formData.get("startAt"), endAt: formData.get("endAt"),
          receivedAt: formData.get("receivedAt"), meetingUrl: formData.get("meetingUrl"),
        });
        await workflow.execute({
          type: "schedule_interview",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          roundLabel: data.roundLabel,
          interviewType: data.interviewType,
          startAt: toIso(data.startAt), endAt: toIso(data.endAt),
          receivedAt: toIso(data.receivedAt), meetingUrl: data.meetingUrl || undefined,
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "已安排面试。" };
      }
      case "task": {
        const data = z.object({ title: z.string().trim().min(1).max(255), deadlineAt: z.string().min(1) }).parse({ title: formData.get("title"), deadlineAt: formData.get("deadlineAt") });
        await workflow.execute({
          type: "create_task",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          kind: "generic",
          title: data.title,
          deadlineAt: toIso(data.deadlineAt),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "待办已创建。" };
      }
      case "complete_task": {
        await workflow.execute({
          type: "complete_task",
          idempotencyKey: base.data.idempotencyKey,
          taskId: z.uuid().parse(formData.get("taskId")),
          completedAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "待办已完成。" };
      }
      case "complete_assessment": {
        const assessmentId = z.uuid().parse(formData.get("assessmentId"));
        await workflow.execute({
          type: "complete_assessment",
          idempotencyKey: base.data.idempotencyKey,
          assessmentId,
          completedAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "测评已完成。" };
      }
      case "cancel_interview": {
        const interviewId = z.uuid().parse(formData.get("interviewId"));
        await workflow.execute({
          type: "cancel_interview",
          idempotencyKey: base.data.idempotencyKey,
          interviewId,
          cancelledAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "面试已取消。" };
      }
      case "complete_interview_review": {
        const interviewId = z.uuid().parse(formData.get("interviewId"));
        await workflow.execute({
          type: "complete_interview_review",
          idempotencyKey: base.data.idempotencyKey,
          interviewId,
          reviewedAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "面试复盘已完成。" };
      }
      case "record_rejection": {
        await workflow.execute({
          type: "record_rejection",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          occurredAt: new Date().toISOString(),
          notes: z.string().trim().max(2000).optional().parse(formData.get("notes") || undefined),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "已记录拒信并结束推进。" };
      }
      case "end_job_track": {
        await workflow.execute({
          type: "end_job_track",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          reason: z.string().trim().min(1).max(64).parse(formData.get("reason")),
          occurredAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "求职推进已结束。" };
      }
    }
  } catch (error) {
    console.error("Job detail action failed", error);
    return { error: error instanceof z.ZodError ? "请检查输入内容。" : "操作失败，请重试。", success: null };
  }
}

function toIso(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("VALIDATION_ERROR: invalid local datetime");
  return date.toISOString();
}

function revalidateWorkspace(jobTrackId: string) {
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/calendar");
  revalidatePath(`/jobs/${jobTrackId}`);
}
