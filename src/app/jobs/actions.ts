"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";

const createJobTrackSchema = z.object({
  idempotencyKey: z.string().min(8),
  companyName: z.string().trim().min(1, "请填写公司名称").max(255),
  roleName: z.string().trim().min(1, "请填写岗位名称").max(255),
  jobDescription: z.string().trim().min(1, "请粘贴岗位 JD"),
  jobUrl: z.union([z.url("岗位链接格式不正确"), z.literal("")]),
});

export type CreateJobTrackFormState = {
  error: string | null;
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
  if (!parsed.success) return { error: "请粘贴要导入的岗位。" };
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
    }, getCurrentActor());
  } catch (error) {
    console.error("Failed to quick import jobs", error);
    return { error: "导入失败，每行请使用“公司｜岗位”格式。" };
  }
  revalidatePath("/");
  revalidatePath("/jobs");
  redirect(`/jobs?tab=${parsed.data.lifecycle}`);
}

export async function createJobTrackAction(
  _previousState: CreateJobTrackFormState,
  formData: FormData,
): Promise<CreateJobTrackFormState> {
  const parsed = createJobTrackSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    companyName: formData.get("companyName"),
    roleName: formData.get("roleName"),
    jobDescription: formData.get("jobDescription"),
    jobUrl: formData.get("jobUrl"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入内容" };
  }

  try {
    await getJobWorkflow().execute(
      {
        type: "create_job_track",
        idempotencyKey: parsed.data.idempotencyKey,
        companyName: parsed.data.companyName,
        roleName: parsed.data.roleName,
        jobDescription: { text: parsed.data.jobDescription },
        jobUrl: parsed.data.jobUrl || undefined,
      },
      getCurrentActor(),
    );
  } catch (error) {
    console.error("Failed to create job track", error);
    return { error: "保存失败，请确认数据库已经启动后重试。" };
  }

  revalidatePath("/");
  revalidatePath("/jobs");
  redirect("/jobs?tab=planned");
}
