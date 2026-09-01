"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";

export type QuickActionState = { error: string | null; success: string | null };

export async function createQuickTaskAction(_state: QuickActionState, formData: FormData): Promise<QuickActionState> {
  try {
    const data = z.object({
      idempotencyKey: z.string().min(8),
      jobTrackId: z.union([z.uuid(), z.literal("")]),
      interviewId: z.union([z.uuid(), z.literal("")]),
      title: z.string().trim().min(1).max(255),
      deadlineAt: z.string().optional(),
    }).parse({
      idempotencyKey: formData.get("idempotencyKey"),
      jobTrackId: formData.get("jobTrackId") || "",
      interviewId: formData.get("interviewId") || "",
      title: formData.get("title"),
      deadlineAt: formData.get("deadlineAt") || undefined,
    });
    if (data.interviewId && !data.jobTrackId) return { error: "绑定面试时必须同时选择岗位。", success: null };
    await getJobWorkflow().execute({
      type: "create_task",
      idempotencyKey: data.idempotencyKey,
      jobTrackId: data.jobTrackId || undefined,
      interviewId: data.interviewId || undefined,
      kind: data.interviewId ? "interview_prep" : "generic",
      title: data.title,
      deadlineAt: data.deadlineAt ? toIso(data.deadlineAt) : undefined,
    }, getCurrentActor());
    revalidateAll(data.jobTrackId || undefined);
    return { error: null, success: "待办已创建。" };
  } catch (error) {
    console.error("Quick task action failed", error);
    return { error: "待办创建失败，请检查输入。", success: null };
  }
}

export async function updateQuickTaskAction(_state: QuickActionState, formData: FormData): Promise<QuickActionState> {
  try {
    const data = z.object({ idempotencyKey: z.string().min(8), taskId: z.uuid(), operation: z.enum(["complete", "cancel"]) }).parse({ idempotencyKey: formData.get("idempotencyKey"), taskId: formData.get("taskId"), operation: formData.get("operation") });
    await getJobWorkflow().execute(data.operation === "complete" ? { type: "complete_task", idempotencyKey: data.idempotencyKey, taskId: data.taskId, completedAt: new Date().toISOString() } : { type: "cancel_task", idempotencyKey: data.idempotencyKey, taskId: data.taskId, cancelledAt: new Date().toISOString() }, getCurrentActor());
    revalidateAll();
    return { error: null, success: data.operation === "complete" ? "待办已完成。" : "待办已取消。" };
  } catch (error) {
    console.error("Quick task update failed", error);
    return { error: "待办操作失败，请刷新后重试。", success: null };
  }
}

export async function recordQuickProgressAction(_state: QuickActionState, formData: FormData): Promise<QuickActionState> {
  try {
    const base = z.object({ idempotencyKey: z.string().min(8), jobTrackId: z.uuid(), progressType: z.enum(["assessment", "interview", "rejection", "generic"]) }).parse({ idempotencyKey: formData.get("idempotencyKey"), jobTrackId: formData.get("jobTrackId"), progressType: formData.get("progressType") });
    const workflow = getJobWorkflow();
    const actor = getCurrentActor();
    if (base.progressType === "assessment") {
      const data = z.object({ assessmentKind: z.enum(["assessment", "written_test"]), title: z.string().trim().min(1).max(255), timingType: z.enum(["deadline", "fixed_slot"]), deadlineAt: z.string().optional(), startAt: z.string().optional(), endAt: z.string().optional(), receivedAt: z.string().min(1) }).parse({ assessmentKind: formData.get("assessmentKind"), title: formData.get("title"), timingType: formData.get("timingType"), deadlineAt: formData.get("deadlineAt") || undefined, startAt: formData.get("startAt") || undefined, endAt: formData.get("endAt") || undefined, receivedAt: formData.get("receivedAt") });
      const timing = data.timingType === "deadline" ? { type: "deadline" as const, deadlineAt: toIso(z.string().min(1).parse(data.deadlineAt)) } : { type: "fixed_slot" as const, startAt: toIso(z.string().min(1).parse(data.startAt)), endAt: toIso(z.string().min(1).parse(data.endAt)) };
      await workflow.execute({ type: "record_assessment_invite", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, assessmentKind: data.assessmentKind, title: data.title, timing, receivedAt: toIso(data.receivedAt) }, actor);
    } else if (base.progressType === "interview") {
      const data = z.object({ roundLabel: z.string().trim().min(1).max(255), interviewType: z.string().trim().min(1).max(255), startAt: z.string().min(1), endAt: z.string().min(1), receivedAt: z.string().min(1), meetingUrl: z.union([z.url(), z.literal("")]), notes: z.string().trim().max(5000).optional() }).parse({ roundLabel: formData.get("roundLabel"), interviewType: formData.get("interviewType"), startAt: formData.get("startAt"), endAt: formData.get("endAt"), receivedAt: formData.get("receivedAt"), meetingUrl: formData.get("meetingUrl"), notes: formData.get("notes") || undefined });
      await workflow.execute({ type: "schedule_interview", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, roundLabel: data.roundLabel, interviewType: data.interviewType, startAt: toIso(data.startAt), endAt: toIso(data.endAt), receivedAt: toIso(data.receivedAt), meetingUrl: data.meetingUrl || undefined, notes: data.notes }, actor);
    } else if (base.progressType === "rejection") {
      await workflow.execute({ type: "record_rejection", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, occurredAt: new Date().toISOString(), notes: z.string().trim().max(2000).optional().parse(formData.get("notes") || undefined) }, actor);
    } else {
      await workflow.execute({ type: "record_generic_progress", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, summary: z.string().trim().min(1).max(2000).parse(formData.get("summary")), occurredAt: new Date().toISOString() }, actor);
    }
    revalidateAll(base.jobTrackId);
    return { error: null, success: "进展已记录。" };
  } catch (error) {
    console.error("Quick progress action failed", error);
    return { error: "进展记录失败，请检查时间和输入内容。", success: null };
  }
}

function revalidateAll(jobTrackId?: string) {
  revalidatePath("/");
  revalidatePath("/quick");
  revalidatePath("/jobs");
  revalidatePath("/calendar");
  if (jobTrackId) revalidatePath(`/jobs/${jobTrackId}`);
}

function toIso(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("VALIDATION_ERROR: invalid local datetime");
  return date.toISOString();
}
