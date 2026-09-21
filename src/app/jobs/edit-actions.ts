"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionReceipts, assetLinks } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getExperienceOptions } from "@/modules/interview-knowledge/queries";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { resolveResumeSelection } from "@/modules/resume-library/form-selection";
import { stageJobDescriptionImages, discardStagedJobDescriptionImages, listJobDescriptionAssetsForCleanup, type StagedJobDescriptionImage } from "@/modules/job-description-assets/service";
import { localTimeToIso } from "@/shared/time/parse-time-input";
import { logServerError } from "@/shared/logging/server-error";

export async function loadJobEditorAction(id: string) {
  const actor = await getCurrentActor();
  const [view, experiences] = await Promise.all([getWorkspaceQueries().read({ type: "get_job_track_detail", jobTrackId: z.uuid().parse(id) }, actor), getExperienceOptions(actor.userId)]);
  return { view, experiences };
}

export async function saveJobEditorAction(form: FormData): Promise<{ error: string | null }> {
  const actor = await getCurrentActor();
  let staged: StagedJobDescriptionImage[] = [];
  let oldImages: StagedJobDescriptionImage[] = [];
  const db = getDatabaseRuntime().db;
  async function cleanUnlinked(candidates: StagedJobDescriptionImage[]) {
    if (!candidates.length) return;
    const links = await db.select({ id: assetLinks.assetId }).from(assetLinks).where(inArray(assetLinks.assetId, candidates.map(item => item.id)));
    await discardStagedJobDescriptionImages(actor.userId, candidates.filter(item => !links.some(link => link.id === item.id)));
  }
  try {
    const jobTrackId = z.uuid().parse(form.get("jobTrackId"));
    const idempotencyKey = z.string().min(8).parse(form.get("idempotencyKey"));
    const [receipt] = await db.select({ id: actionReceipts.id }).from(actionReceipts).where(and(eq(actionReceipts.userId, actor.userId), eq(actionReceipts.idempotencyKey, idempotencyKey)));
    if (receipt) return { error: null };
    const { view } = await loadJobEditorAction(jobTrackId);
    const version = z.coerce.number().int().positive().parse(form.get("version"));
    if (view.jobTrack.version !== version) return { error: "岗位已被其他操作修改，请关闭后重新打开编辑。" };
    const lifecycle = form.has("lifecycle") ? z.enum(["planned", "active"]).parse(form.get("lifecycle")) : undefined;
    const companyName = z.string().trim().min(1).max(255).parse(form.get("companyName"));
    const roleName = z.string().trim().min(1).max(255).parse(form.get("roleName"));
    const department = z.string().trim().max(255).parse(form.get("department") ?? "");
    const text = z.string().max(50000).parse(form.get("jobDescription"));
    const jobUrl = z.union([z.url(), z.literal("")]).parse(form.get("jobUrl"));
    const preferenceRank = form.get("preferenceRank") ? z.coerce.number().int().positive().parse(form.get("preferenceRank")) : null;
    const submittedAt = lifecycle === "active" && form.get("submittedAt") ? localTimeToIso(String(form.get("submittedAt"))) : undefined;
    const retained = z.array(z.uuid()).parse(form.getAll("imageIds"));
    if (retained.some(id => !view.jobDescriptionImages.some(image => image.id === id))) return { error: "图片不属于当前岗位，请重新打开编辑。" };
    oldImages = await listJobDescriptionAssetsForCleanup({ userId: actor.userId, jobTrackId });
    const files = form.getAll("jdImages").filter((value): value is File => value instanceof File && value.size > 0);
    staged = files.length ? await stageJobDescriptionImages({ userId: actor.userId, files }) : [];
    const resumeId = lifecycle === "active" && form.has("resumeMode") ? await resolveResumeSelection({ userId: actor.userId, formData: form }) : undefined;
    await getJobWorkflow().execute({ type: "update_job_track_context", jobTrackId, idempotencyKey, version, companyName, roleName, department: department || null, preferenceRank, lifecycle, submittedAt, resumeId, jobUrl: jobUrl || undefined, jobDescription: { text, imageAssetIds: [...new Set([...retained, ...staged.map(image => image.id)])] } }, actor);
    await cleanUnlinked([...staged, ...oldImages]).catch(error => logServerError("Saved job image cleanup failed", error));
    for (const path of ["/", "/jobs", `/jobs/${jobTrackId}`, "/calendar", "/quick", "/faq"]) revalidatePath(path);
    revalidatePath("/interviews/[id]", "page");
    return { error: null };
  } catch (error) {
    await cleanUnlinked(staged).catch(cleanupError => logServerError("Job edit image cleanup failed", cleanupError));
    logServerError("Job editor save failed", error);
    return { error: error instanceof z.ZodError ? "请检查必填项、链接和志愿格式。" : error instanceof Error && error.message.startsWith("CONFLICT:") ? error.message.slice(9) : "保存失败，请检查 JD、简历和输入信息后重试。" };
  }
}
