"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { commitFaqBatch, createExperience, deleteFaq, setResumeExperiences, updateExperience, updateFaq } from "@/modules/interview-knowledge/service";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { logServerError } from "@/shared/logging/server-error";

export type KnowledgeActionState = { error: string | null; success: string | null };

export async function createExperienceAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({ name: z.string().trim().min(1).max(255), content: z.string().trim().min(1) }).parse({ name: formData.get("name"), content: formData.get("content") });
    await createExperience({ userId: getCurrentActor().userId, ...data });
    revalidatePath("/faq");
    return { error: null, success: "经历已保存。" };
  } catch (error) {
    logServerError("Failed to create experience", error);
    return { error: "经历保存失败，请检查输入。", success: null };
  }
}

export async function updateExperienceAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({ experienceId: z.uuid(), name: z.string().trim().min(1).max(255), content: z.string().trim().min(1).max(100000) }).parse({ experienceId: formData.get("experienceId"), name: formData.get("name"), content: formData.get("content") });
    await updateExperience({ userId: getCurrentActor().userId, ...data });
    revalidatePath("/faq");
    revalidatePath(`/experiences/${data.experienceId}`);
    revalidatePath("/interviews/[id]", "page");
    return { error: null, success: "经历已更新。" };
  } catch (error) {
    logServerError("Failed to update experience", error);
    return { error: "经历更新失败，请检查输入。", success: null };
  }
}

export async function commitFaqBatchAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({
      idempotencyKey: z.string().min(8), interviewId: z.uuid(), itemsJson: z.string().min(2).max(1_000_000),
    }).parse({
      idempotencyKey: formData.get("idempotencyKey"), interviewId: formData.get("interviewId"), itemsJson: formData.get("itemsJson"),
    });
    const items = z.array(z.object({
      question: z.string().trim().min(1).max(10_000),
      answer: z.string().trim().min(1).max(100_000),
      kind: z.enum(["experience", "general"]),
      category: z.string().trim().min(1).max(64),
      experienceId: z.uuid().nullable(),
    })).min(1).max(100).parse(JSON.parse(data.itemsJson));
    await commitFaqBatch({
      userId: getCurrentActor().userId,
      idempotencyKey: data.idempotencyKey,
      interviewId: data.interviewId,
      committedAt: new Date().toISOString(),
      items,
    });
    revalidatePath("/");
    revalidatePath("/faq");
    revalidatePath("/jobs/[id]", "page");
    revalidatePath(`/interviews/${data.interviewId}`);
    return { error: null, success: `已导入 ${items.length} 条 FAQ。` };
  } catch (error) {
    logServerError("Failed to commit FAQ batch", error);
    return { error: "FAQ 导入失败，请检查分类和经历绑定。", success: null };
  }
}

export async function setResumeExperiencesAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const resumeId = z.uuid().parse(formData.get("resumeId"));
    const experienceIds = formData.getAll("experienceIds").map(String).map((id) => z.uuid().parse(id));
    await setResumeExperiences({ userId: getCurrentActor().userId, resumeId, experienceIds });
    revalidatePath("/faq");
    return { error: null, success: "简历与经历的关联已更新。" };
  } catch (error) {
    logServerError("Failed to link resume experiences", error);
    return { error: "关联保存失败。", success: null };
  }
}

export async function updateFaqAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({
      faqId: z.uuid(), question: z.string().trim().min(1), answer: z.string().trim().min(1),
      kind: z.enum(["experience", "general"]), category: z.string().min(1), experienceId: z.string().optional(),
    }).parse({
      faqId: formData.get("faqId"), question: formData.get("question"), answer: formData.get("answer"),
      kind: formData.get("kind"), category: formData.get("category"), experienceId: formData.get("experienceId") || undefined,
    });
    await updateFaq({
      userId: getCurrentActor().userId,
      faqId: data.faqId,
      item: { question: data.question, answer: data.answer, kind: data.kind, category: data.category, experienceId: data.kind === "experience" ? data.experienceId ?? null : null },
    });
    revalidatePath("/faq");
    revalidatePath("/experiences/[id]", "page");
    revalidatePath("/interviews/[id]", "page");
    return { error: null, success: "FAQ 已更新。" };
  } catch (error) {
    logServerError("Failed to update FAQ", error);
    return { error: "FAQ 更新失败。", success: null };
  }
}

export async function deleteFaqAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    await deleteFaq({ userId: getCurrentActor().userId, faqId: z.uuid().parse(formData.get("faqId")) });
    revalidatePath("/faq");
    revalidatePath("/experiences/[id]", "page");
    revalidatePath("/interviews/[id]", "page");
    return { error: null, success: "FAQ 已删除。" };
  } catch (error) {
    logServerError("Failed to delete FAQ", error);
    return { error: "FAQ 删除失败。", success: null };
  }
}
