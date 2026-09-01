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
