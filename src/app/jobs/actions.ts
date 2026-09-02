"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { discardStagedJobDescriptionImages, stageJobDescriptionImages, type StagedJobDescriptionImage } from "@/modules/job-description-assets/service";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { resolveResumeSelection } from "@/modules/resume-library/form-selection";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { logServerError } from "@/shared/logging/server-error";

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
};

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
  const files = formData.getAll("jobDescriptionImages").filter((item): item is File => item instanceof File && item.size > 0);
  const parsed = createJobTrackSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    creationMode: formData.get("creationMode"),
    companyName: formData.get("companyName"),
    roleName: formData.get("roleName"),
    jobDescription: formData.get("jobDescription"),
    jobUrl: formData.get("jobUrl"),
    submittedAt: String(formData.get("submittedAt") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入内容", success: null };
  }
  if (!parsed.data.jobDescription && files.length === 0) return { error: "请粘贴 JD 文本或上传 JD 图片。", success: null };
  if (parsed.data.creationMode === "active" && !parsed.data.submittedAt) return { error: "新增已投递时请填写投递时间。", success: null };

  let staged: StagedJobDescriptionImage[] = [];
  let jobCreated = false;
  try {
    if (files.length) staged = await stageJobDescriptionImages({ userId: (await getCurrentActor()).userId, files });
    const actor = await getCurrentActor();
    const resumeId = parsed.data.creationMode === "active"
      ? await resolveResumeSelection({ userId: actor.userId, formData })
      : null;
    const created = await getJobWorkflow().execute(
      {
        type: "create_job_track",
        idempotencyKey: parsed.data.idempotencyKey,
        companyName: parsed.data.companyName,
        roleName: parsed.data.roleName,
        jobDescription: { text: parsed.data.jobDescription || undefined, imageAssetIds: staged.map((asset) => asset.id) },
        jobUrl: parsed.data.jobUrl || undefined,
      },
      actor,
    );
    jobCreated = true;
    if (parsed.data.creationMode === "active") {
      await getJobWorkflow().execute({
        type: "submit_application",
        idempotencyKey: `${parsed.data.idempotencyKey}:submit`,
        jobTrackId: created.jobTrack.id,
        resumeId: z.uuid().parse(resumeId),
        submittedAt: toIso(parsed.data.submittedAt ?? ""),
      }, actor);
    }
  } catch (error) {
    if (!jobCreated) await discardStagedJobDescriptionImages((await getCurrentActor()).userId, staged).catch(() => undefined);
    logServerError("Failed to create job track", error);
    return { error: jobCreated ? "岗位已保存为待投递，但记录投递失败；请进入详情页补记投递。" : "保存失败，请检查简历、经历和 JD 内容。", success: null };
  }

  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/faq");
  return { error: null, success: parsed.data.creationMode === "planned" ? "待投递岗位已创建。" : "已投递岗位已创建。" };
}

function toIso(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("VALIDATION_ERROR: invalid local datetime");
  return date.toISOString();
}
