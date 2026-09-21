"use server";
import { getCompanyOptions } from "@/modules/workspace-queries/company-options";


import { formTimeToIso } from "@/shared/time/parse-time-input";
import { taskTimingFromForm } from "@/shared/time/task-timing";
import { scheduledTimingFromForm } from "@/shared/time/scheduled-timing";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExperienceOptions, getFaqCategoryConfig } from "@/modules/interview-knowledge/queries";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getResumeOptions } from "@/modules/resume-library/queries";
import { getQuickActionOptions } from "@/modules/workspace-queries/quick-options";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { logServerError } from "@/shared/logging/server-error";

export type QuickActionState = { error: string | null; success: string | null };

export async function loadGlobalQuickOptionsAction() {
  const actor = await getCurrentActor();
  const [quick, resumes, experiences, faqCategories, companies] = await Promise.all([
    getQuickActionOptions(actor.userId),
    getResumeOptions(actor.userId),
    getExperienceOptions(actor.userId),
    getFaqCategoryConfig(actor.userId),
    getCompanyOptions(actor.userId),
  ]);
  return { ...quick, resumes, experiences, faqCategories, companies };
}

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
      ...taskTimingFromForm(formData),
    }, await getCurrentActor());
    revalidateAll(data.jobTrackId || undefined);
    return { error: null, success: "待办已创建。" };
  } catch (error) {
    logServerError("Quick task action failed", error);
    return { error: "待办创建失败，请检查输入。", success: null };
  }
}

export async function updateQuickTaskAction(_state: QuickActionState, formData: FormData): Promise<QuickActionState> {
  try {
    const data = z.object({ idempotencyKey: z.string().min(8), taskId: z.uuid(), operation: z.enum(["complete", "cancel"]) }).parse({ idempotencyKey: formData.get("idempotencyKey"), taskId: formData.get("taskId"), operation: formData.get("operation") });
    await getJobWorkflow().execute(data.operation === "complete" ? { type: "complete_task", idempotencyKey: data.idempotencyKey, taskId: data.taskId, completedAt: new Date().toISOString() } : { type: "cancel_task", idempotencyKey: data.idempotencyKey, taskId: data.taskId, cancelledAt: new Date().toISOString() }, await getCurrentActor());
    revalidateAll();
    return { error: null, success: data.operation === "complete" ? "待办已完成。" : "待办已取消。" };
  } catch (error) {
    logServerError("Quick task update failed", error);
    return { error: "待办操作失败，请刷新后重试。", success: null };
  }
}

export async function recordQuickProgressAction(_state: QuickActionState, formData: FormData): Promise<QuickActionState> {
  try {
    const base = z.object({ idempotencyKey: z.string().min(8), jobTrackId: z.uuid(), progressType: z.enum(["assessment", "interview", "rejection", "generic", "end"]) }).parse({ idempotencyKey: formData.get("idempotencyKey"), jobTrackId: formData.get("jobTrackId"), progressType: formData.get("progressType") });
    const workflow = getJobWorkflow();
    const actor = await getCurrentActor();
    if (base.progressType === "assessment") {
      const data = z.object({ assessmentKind: z.enum(["assessment", "written_test"]), title: z.string().trim().min(1).max(255), timingType: z.enum(["deadline", "fixed_slot"]), deadlineAt: z.string().optional(), startAt: z.string().optional(), endAt: z.string().optional(), receivedAt: z.string().min(1) }).parse({ assessmentKind: formData.get("assessmentKind"), title: formData.get("title"), timingType: formData.get("timingType"), deadlineAt: formData.get("deadlineAt") || undefined, startAt: formData.get("startAt") || undefined, endAt: formData.get("endAt") || undefined, receivedAt: formData.get("receivedAt") });
      const timing = scheduledTimingFromForm(formData);
      await workflow.execute({ type: "record_assessment_invite", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, assessmentKind: data.assessmentKind, assessmentUrl: String(formData.get("assessmentUrl") ?? ""), title: data.title, timing, receivedAt: toIso(data.receivedAt) }, actor);
    } else if (base.progressType === "interview") {
      const data = z.object({ roundLabel: z.string().trim().min(1).max(255), interviewType: z.string().trim().max(255).optional(), timingType: z.enum(["deadline", "fixed_slot"]), receivedAt: z.string().min(1), meetingUrl: z.union([z.url(), z.literal("")]), notes: z.string().trim().max(5000).optional() }).parse({ roundLabel: formData.get("roundLabel"), interviewType: formData.get("interviewType") || undefined, timingType: formData.get("timingType"), receivedAt: formData.get("receivedAt"), meetingUrl: formData.get("meetingUrl"), notes: formData.get("notes") || undefined });
      await workflow.execute({ type: "schedule_interview", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, roundLabel: data.roundLabel, interviewType: data.interviewType, timing: scheduledTimingFromForm(formData), receivedAt: toIso(data.receivedAt), meetingUrl: data.meetingUrl || undefined, notes: data.notes }, actor);
    } else if (base.progressType === "rejection") {
      await workflow.execute({ type: "record_rejection", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, occurredAt: new Date().toISOString(), notes: z.string().trim().max(2000).optional().parse(formData.get("notes") || undefined) }, actor);
    } else if (base.progressType === "generic") {
      await workflow.execute({ type: "record_generic_progress", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, summary: z.string().trim().min(1).max(2000).parse(formData.get("summary")), occurredAt: new Date().toISOString() }, actor);
    } else {
      await workflow.execute({ type: "end_job_track", idempotencyKey: base.idempotencyKey, jobTrackId: base.jobTrackId, reason: z.string().trim().min(1).max(64).parse(formData.get("reason")), occurredAt: new Date().toISOString() }, actor);
    }
    revalidateAll(base.jobTrackId);
    return { error: null, success: "进展已记录。" };
  } catch (error) {
    logServerError("Quick progress action failed", error);
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

function toIso(value: string): string { return formTimeToIso(value); }

export async function editQuickTaskAction(form: FormData): Promise<QuickActionState> {
  try {
    const taskId = z.uuid().parse(form.get("taskId"));
    const title = z.string().trim().min(1).max(255).parse(form.get("title"));
    const idempotencyKey = z.string().min(8).parse(form.get("idempotencyKey"));
    const actor = await getCurrentActor();
    const options = await getQuickActionOptions(actor.userId);
    if (!options.unboundTasks.some(task => task.id === taskId)) return { error: "待办不存在或已完成，请刷新。", success: null };
    await getJobWorkflow().execute({ type: "update_task", taskId, title, idempotencyKey, ...taskTimingFromForm(form) }, actor);
    revalidateAll();
    return { error: null, success: "待办已更新。" };
  } catch (error) {
    logServerError("Quick task edit failed", error);
    return { error: "保存失败，请检查时间范围，或刷新后重试。", success: null };
  }
}
