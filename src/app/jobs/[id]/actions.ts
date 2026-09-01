"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uploadJobDescriptionImages } from "@/modules/job-description-assets/service";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { uploadResumeVersion } from "@/modules/resume-library/service";
import { discardTranscriptAsset, stageTranscriptAsset, type StagedTranscriptAsset } from "@/modules/transcript-assets/service";
import { getCurrentActor } from "@/shared/actor/current-actor";

export type JobDetailActionState = { error: string | null; success: string | null };

const baseSchema = z.object({
  intent: z.enum(["submit", "update_context", "assessment", "interview", "reschedule_interview", "save_interview_transcript", "task", "update_task", "complete_task", "cancel_task", "complete_assessment", "cancel_assessment", "cancel_interview", "confirm_interview_occurred", "complete_interview_review", "record_rejection", "end_job_track", "record_generic_progress", "delete_planned_job_track", "upload_resume", "upload_jd_images"]),
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
      case "update_context": {
        const data = z.object({
          version: z.coerce.number().int().positive(), companyName: z.string().trim().min(1).max(255),
          roleName: z.string().trim().min(1).max(255), jobDescription: z.string(),
          jobUrl: z.union([z.url(), z.literal("")]),
        }).parse({
          version: formData.get("version"), companyName: formData.get("companyName"), roleName: formData.get("roleName"),
          jobDescription: formData.get("jobDescription"), jobUrl: formData.get("jobUrl"),
        });
        await workflow.execute({
          type: "update_job_track_context",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          version: data.version,
          companyName: data.companyName,
          roleName: data.roleName,
          jobDescription: { text: data.jobDescription },
          jobUrl: data.jobUrl || undefined,
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "岗位上下文已更新。" };
      }
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
      case "upload_jd_images": {
        const files = formData.getAll("jdImages").filter((item): item is File => item instanceof File && item.size > 0);
        await uploadJobDescriptionImages({ userId: actor.userId, jobTrackId: base.data.jobTrackId, files });
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: `已上传 ${files.length} 张 JD 图片。` };
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
          timingType: z.enum(["deadline", "fixed_slot"]),
          deadlineAt: z.string().optional(), startAt: z.string().optional(), endAt: z.string().optional(),
          receivedAt: z.string().min(1),
        }).parse({
          assessmentKind: formData.get("assessmentKind"), title: formData.get("title"),
          timingType: formData.get("timingType"), deadlineAt: formData.get("deadlineAt") || undefined,
          startAt: formData.get("startAt") || undefined, endAt: formData.get("endAt") || undefined,
          receivedAt: formData.get("receivedAt"),
        });
        const timing = data.timingType === "deadline"
          ? { type: "deadline" as const, deadlineAt: toIso(z.string().min(1).parse(data.deadlineAt)) }
          : { type: "fixed_slot" as const, startAt: toIso(z.string().min(1).parse(data.startAt)), endAt: toIso(z.string().min(1).parse(data.endAt)) };
        await workflow.execute({
          type: "record_assessment_invite",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          assessmentKind: data.assessmentKind,
          title: data.title,
          timing,
          receivedAt: toIso(data.receivedAt),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "已记录测评并创建待办。" };
      }
      case "interview": {
        const data = z.object({
          sequenceNo: z.coerce.number().int().positive().optional(),
          roundLabel: z.string().trim().min(1).max(255),
          interviewType: z.string().trim().min(1).max(255),
          startAt: z.string().min(1), endAt: z.string().min(1), receivedAt: z.string().min(1),
          meetingUrl: z.union([z.url(), z.literal("")]),
          notes: z.string().trim().max(5000).optional(),
        }).parse({
          sequenceNo: formData.get("sequenceNo") || undefined,
          roundLabel: formData.get("roundLabel"), interviewType: formData.get("interviewType"),
          startAt: formData.get("startAt"), endAt: formData.get("endAt"),
          receivedAt: formData.get("receivedAt"), meetingUrl: formData.get("meetingUrl"),
          notes: formData.get("notes") || undefined,
        });
        await workflow.execute({
          type: "schedule_interview",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          sequenceNo: data.sequenceNo,
          roundLabel: data.roundLabel,
          interviewType: data.interviewType,
          startAt: toIso(data.startAt), endAt: toIso(data.endAt),
          receivedAt: toIso(data.receivedAt), meetingUrl: data.meetingUrl || undefined,
          notes: data.notes,
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "已安排面试。" };
      }
      case "reschedule_interview": {
        const data = z.object({ interviewId: z.uuid(), startAt: z.string().min(1), endAt: z.string().min(1) }).parse({ interviewId: formData.get("interviewId"), startAt: formData.get("startAt"), endAt: formData.get("endAt") });
        await workflow.execute({
          type: "reschedule_interview",
          idempotencyKey: base.data.idempotencyKey,
          interviewId: data.interviewId,
          startAt: toIso(data.startAt),
          endAt: toIso(data.endAt),
          changedAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        revalidatePath(`/interviews/${data.interviewId}`);
        return { error: null, success: "面试时间已更新。" };
      }
      case "save_interview_transcript": {
        const interviewId = z.uuid().parse(formData.get("interviewId"));
        const transcriptText = z.string().trim().max(1000000).parse(formData.get("transcriptText") ?? "");
        const transcriptFile = formData.get("transcriptFile");
        const hasFile = transcriptFile instanceof File && transcriptFile.size > 0;
        if (!transcriptText && !hasFile) return { error: "请粘贴转录文本或上传转录文件。", success: null };
        let staged: StagedTranscriptAsset | null = null;
        try {
          if (hasFile) staged = await stageTranscriptAsset({ userId: actor.userId, interviewId, file: transcriptFile });
          await workflow.execute({
            type: "save_interview_transcript",
            idempotencyKey: base.data.idempotencyKey,
            interviewId,
            transcriptText: transcriptText || undefined,
            transcriptAssetId: staged?.id,
            savedAt: new Date().toISOString(),
          }, actor);
        } catch (error) {
          await discardTranscriptAsset(actor.userId, staged).catch(() => undefined);
          throw error;
        }
        revalidateWorkspace(base.data.jobTrackId);
        revalidatePath(`/interviews/${interviewId}`);
        return { error: null, success: "面试转录已保存。" };
      }
      case "task": {
        const data = z.object({ title: z.string().trim().min(1).max(255), deadlineAt: z.string().min(1), interviewId: z.union([z.uuid(), z.literal("")]) }).parse({ title: formData.get("title"), deadlineAt: formData.get("deadlineAt"), interviewId: formData.get("interviewId") || "" });
        await workflow.execute({
          type: "create_task",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          kind: data.interviewId ? "interview_prep" : "generic",
          interviewId: data.interviewId || undefined,
          title: data.title,
          deadlineAt: toIso(data.deadlineAt),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        if (data.interviewId) revalidatePath(`/interviews/${data.interviewId}`);
        return { error: null, success: "待办已创建。" };
      }
      case "update_task": {
        const data = z.object({
          taskId: z.uuid(),
          title: z.string().trim().min(1).max(255),
          deadlineAt: z.string().optional(),
          interviewId: z.union([z.uuid(), z.literal("")]),
        }).parse({
          taskId: formData.get("taskId"),
          title: formData.get("title"),
          deadlineAt: formData.get("deadlineAt") || undefined,
          interviewId: formData.get("interviewId") || "",
        });
        await workflow.execute({
          type: "update_task",
          idempotencyKey: base.data.idempotencyKey,
          taskId: data.taskId,
          title: data.title,
          deadlineAt: data.deadlineAt ? toIso(data.deadlineAt) : undefined,
          interviewId: data.interviewId || null,
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "待办已更新。" };
      }
      case "complete_task": {
        await workflow.execute({
          type: "complete_task",
          idempotencyKey: base.data.idempotencyKey,
          taskId: z.uuid().parse(formData.get("taskId")),
          completedAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        revalidatePath("/interviews/[id]", "page");
        return { error: null, success: "待办已完成。" };
      }
      case "cancel_task": {
        await workflow.execute({
          type: "cancel_task",
          idempotencyKey: base.data.idempotencyKey,
          taskId: z.uuid().parse(formData.get("taskId")),
          cancelledAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        revalidatePath("/interviews/[id]", "page");
        return { error: null, success: "待办已取消。" };
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
      case "cancel_assessment": {
        await workflow.execute({
          type: "cancel_assessment",
          idempotencyKey: base.data.idempotencyKey,
          assessmentId: z.uuid().parse(formData.get("assessmentId")),
          cancelledAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "测评已取消。" };
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
      case "confirm_interview_occurred": {
        const interviewId = z.uuid().parse(formData.get("interviewId"));
        await workflow.execute({
          type: "confirm_interview_occurred",
          idempotencyKey: base.data.idempotencyKey,
          interviewId,
          occurredAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        revalidatePath(`/interviews/${interviewId}`);
        return { error: null, success: "已确认面试发生。" };
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
      case "record_generic_progress": {
        await workflow.execute({
          type: "record_generic_progress",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
          summary: z.string().trim().min(1).max(2000).parse(formData.get("summary")),
          occurredAt: new Date().toISOString(),
        }, actor);
        revalidateWorkspace(base.data.jobTrackId);
        return { error: null, success: "进展已记录。" };
      }
      case "delete_planned_job_track": {
        await workflow.execute({
          type: "delete_planned_job_track",
          idempotencyKey: base.data.idempotencyKey,
          jobTrackId: base.data.jobTrackId,
        }, actor);
        revalidatePath("/");
        revalidatePath("/jobs");
        redirect("/jobs?tab=planned");
      }
    }
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Job detail action failed", error);
    return { error: error instanceof z.ZodError ? "请检查输入内容。" : "操作失败，请重试。", success: null };
  }
}

function isRedirectError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT"));
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
