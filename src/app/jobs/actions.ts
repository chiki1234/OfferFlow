"use server";

import { and, eq, sql } from "drizzle-orm";
import { actionReceipts, jobTracks } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { resolveResumeSelection } from "@/modules/resume-library/form-selection";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { logServerError } from "@/shared/logging/server-error";
import { validateCreateJobForm, type JobFieldErrors } from "./create-job-validation";

const createJobTrackSchema = z.object({
  idempotencyKey: z.string().min(8),
  creationMode: z.enum(["planned", "active"]),
  companyName: z.string().trim().min(1, "请填写公司名称").max(255),
  roleName: z.string().trim().min(1, "请填写岗位名称").max(255),
  jobDescription: z.string().trim().max(50000),
  jobUrl: z.union([z.url("岗位链接格式不正确"), z.literal("")]),
  submittedAt: z.string().optional(),
});

export type CreateJobTrackFormState = {
  error: string | null;
  success: string | null;
  fieldErrors?: JobFieldErrors;
};

async function preferenceErrors(userId: string, data: FormData): Promise<JobFieldErrors> {
  const rows = await getDatabaseRuntime().db.select({ rank: jobTracks.preferenceRank }).from(jobTracks).where(and(
    eq(jobTracks.userId, userId),
    sql`lower(btrim(${jobTracks.companyName})) = ${String(data.get("companyName") ?? "").trim().toLowerCase()}`,
  ));
  const occupied = new Set(rows.map(row => row.rank));
  const errors: JobFieldErrors = {};
  for (const key of data.getAll("roleKeys").map(String)) {
    const name = `roles.${key}.preferenceRank`;
    if (data.get(name) && occupied.has(Number(data.get(name)))) errors[name] = "该公司已有岗位使用此志愿，请选择其他志愿";
  }
  return errors;
}

export async function quickImportJobTracksAction(
  _previousState: CreateJobTrackFormState,
  formData: FormData,
): Promise<CreateJobTrackFormState> {
  const parsed = z.object({
    idempotencyKey: z.string().min(8),
    lifecycle: z.enum(["planned", "active"]),
    raw: z.string().trim().min(1),
  }).safeParse({ idempotencyKey: formData.get("idempotencyKey"), lifecycle: formData.get("lifecycle"), raw: formData.get("raw") });
  if (!parsed.success) return { error: "请粘贴要导入的岗位。", success: null };
  try {
    const entries = parsed.data.raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [companyName, roleName, ...extra] = line.split(/[|｜]/).map((part) => part.trim());
      if (!companyName || !roleName || extra.length) throw new Error("INVALID_LINE");
      return { companyName, roleName };
    });
    await getJobWorkflow().execute({
      type: "quick_import_job_tracks",
      idempotencyKey: parsed.data.idempotencyKey,
      lifecycle: parsed.data.lifecycle,
      entries,
    }, await getCurrentActor());
  } catch (error) {
    logServerError("Failed to quick import jobs", error);
    return { error: "导入失败，每行请使用“公司｜岗位”格式。", success: null };
  }
  revalidatePath("/");
  revalidatePath("/jobs");
  return { error: null, success: "岗位已批量创建。" };
}

export async function createJobTrackAction(
  _previousState: CreateJobTrackFormState,
  formData: FormData,
): Promise<CreateJobTrackFormState> {
  const actor = await getCurrentActor();
  let currentField: string | undefined;
  try {
    const creationMode = z.enum(["planned", "active"]).parse(formData.get("creationMode"));
    const idempotencyKey = z.string().min(8).parse(formData.get("idempotencyKey"));
    const [receipt] = await getDatabaseRuntime().db.select({ id: actionReceipts.id }).from(actionReceipts).where(and(eq(actionReceipts.userId, actor.userId), eq(actionReceipts.idempotencyKey, idempotencyKey)));
    if (receipt) return { error: null, success: "岗位已全部保存。" };
    const keys = formData.getAll("roleKeys").map(String);
    if (!keys.length || keys.length > 30 || new Set(keys).size !== keys.length) return { error: "请添加 1–30 个岗位。", success: null };
    const fieldErrors = validateCreateJobForm(formData);
    if (Object.keys(fieldErrors).length) return { error: "请修改标红的表单项后保存。", success: null, fieldErrors };
    const companyName = z.string().trim().min(1).max(255).parse(formData.get("companyName"));
    const conflicts = await preferenceErrors(actor.userId, formData);
    if (Object.keys(conflicts).length) return { error: "请修改标红的志愿后保存。", success: null, fieldErrors: conflicts };
    const ranks = new Set<number>();
    const parsedRoles = keys.map(key => {
      const prefix = "roles." + key + ".";
      const fields = new FormData();
      for (const [name, value] of formData.entries()) if (name.startsWith(prefix)) fields.append(name.slice(prefix.length), value);
      const parsed = createJobTrackSchema.parse({ idempotencyKey, creationMode, companyName, roleName: fields.get("roleName"), jobDescription: fields.get("jobDescription") ?? "", jobUrl: fields.get("jobUrl") });
      const preferenceRank = fields.get("preferenceRank") ? z.coerce.number().int().positive().parse(fields.get("preferenceRank")) : null;
      if (preferenceRank !== null && ranks.has(preferenceRank)) throw new Error("CONFLICT: 同公司志愿不能重复");
      if (preferenceRank !== null) ranks.add(preferenceRank);
      return { parsed, fields, preferenceRank, prefix };
    });
    const entries = [];
    for (const role of parsedRoles) {
      currentField = role.prefix + (role.fields.get("resumeMode") === "existing" ? "resumeId" : "resumeFile");
      const resumeId = creationMode === "active" ? await resolveResumeSelection({ userId: actor.userId, formData: role.fields }) : undefined;
      entries.push({ department: z.string().trim().max(255).parse(role.fields.get("department") ?? "") || undefined, roleName: role.parsed.roleName, preferenceRank: role.preferenceRank, jobUrl: role.parsed.jobUrl || undefined, jobDescription: { text: role.parsed.jobDescription || undefined, imageAssetIds: [] }, resumeId });
    }
    currentField = undefined;
    await getJobWorkflow().execute({ type: "create_company_jobs", idempotencyKey, companyName, lifecycle: creationMode, entries }, actor);
    revalidatePath("/"); revalidatePath("/jobs"); revalidatePath("/faq");
    return { error: null, success: "岗位已全部保存。" };
  } catch (error) {
    logServerError("Failed to create company jobs", error);
    if (error instanceof Error && error.message.includes("同公司志愿不能重复")) {
      return { error: "同公司志愿不能重复，请修改后保存。", success: null, fieldErrors: await preferenceErrors(actor.userId, formData).catch(() => ({})) };
    }
    const fieldErrors: JobFieldErrors = {};
    if (currentField && (error instanceof z.ZodError || error instanceof Error && /VALIDATION_ERROR|NOT_FOUND/.test(error.message))) {
      fieldErrors[currentField] = "请检查此项内容，重新选择有效的文件或记录";
    }
    return { error: "保存失败，填写内容已保留，请重试。已上传的新简历可在简历库中继续使用。", success: null, fieldErrors };
  }
}
