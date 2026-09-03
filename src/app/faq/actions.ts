"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NO_SOURCE_INTERVIEW } from "@/modules/interview-knowledge/faq-batch";
import { commitFaqBatch, createExperience, createFaqCategory, deleteExperience, deleteFaq, deleteFaqCategory, renameFaqCategory, setResumeExperiences, updateExperience, updateFaq } from "@/modules/interview-knowledge/service";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { logServerError } from "@/shared/logging/server-error";

export type KnowledgeActionState = { error: string | null; success: string | null };

export async function createExperienceAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({ name: z.string().trim().min(1).max(255), content: z.string().trim().min(1) }).parse({ name: formData.get("name"), content: formData.get("content") });
    await createExperience({ userId: (await getCurrentActor()).userId, ...data });
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
    await updateExperience({ userId: (await getCurrentActor()).userId, ...data });
    revalidatePath("/faq");
    revalidatePath(`/experiences/${data.experienceId}`);
    revalidatePath("/interviews/[id]", "page");
    return { error: null, success: "经历已更新。" };
  } catch (error) {
    logServerError("Failed to update experience", error);
    return { error: "经历更新失败，请检查输入。", success: null };
  }
}

export async function deleteExperienceAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const experienceId = z.uuid().parse(formData.get("experienceId"));
    const result = await deleteExperience({ userId: (await getCurrentActor()).userId, experienceId });
    if (result.outcome === "blocked") {
      return { error: `该经历仍关联 ${result.faqCount} 条 FAQ，请先调整或删除这些 FAQ。`, success: null };
    }
    revalidatePath("/faq");
    revalidatePath("/experiences/[id]", "page");
    revalidatePath("/interviews/[id]", "page");
    revalidatePath("/jobs");
    return { error: null, success: "经历已删除。" };
  } catch (error) {
    logServerError("Failed to delete experience", error);
    return { error: "经历删除失败，请稍后重试。", success: null };
  }
}

export async function commitFaqBatchAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({
      idempotencyKey: z.string().min(8), interviewId: z.union([z.uuid(), z.literal(NO_SOURCE_INTERVIEW)]).transform((value) => value === NO_SOURCE_INTERVIEW ? null : value), itemsJson: z.string().min(2).max(1_000_000),
    }).parse({
      idempotencyKey: formData.get("idempotencyKey"), interviewId: formData.get("interviewId"), itemsJson: formData.get("itemsJson"),
    });
    const items = z.array(z.object({
      question: z.string().trim().min(1).max(10_000),
      answer: z.string().trim().max(100_000),
      binding: z.enum(["bound", "unbound"]),
      category: z.string().trim().max(64).nullable(),
      experienceId: z.uuid().nullable(),
    })).min(1).max(100).parse(JSON.parse(data.itemsJson));
    await commitFaqBatch({
      userId: (await getCurrentActor()).userId,
      idempotencyKey: data.idempotencyKey,
      interviewId: data.interviewId,
      committedAt: new Date().toISOString(),
      items,
    });
    revalidatePath("/");
    revalidatePath("/faq");
    revalidatePath("/jobs/[id]", "page");
    if (data.interviewId) revalidatePath(`/interviews/${data.interviewId}`);
    return { error: null, success: `已导入 ${items.length} 条 FAQ。` };
  } catch (error) {
    logServerError("Failed to commit FAQ batch", error);
    return { error: "FAQ 导入失败，请检查问题内容或已填写的设置。", success: null };
  }
}

export async function setResumeExperiencesAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const resumeId = z.uuid().parse(formData.get("resumeId"));
    const experienceIds = z.array(z.uuid()).min(1).parse(formData.getAll("experienceIds").map(String));
    await setResumeExperiences({ userId: (await getCurrentActor()).userId, resumeId, experienceIds });
    revalidatePath("/faq");
    return { error: null, success: "简历与经历的关联已更新。" };
  } catch (error) {
    logServerError("Failed to link resume experiences", error);
    return { error: "请至少关联一项经历。", success: null };
  }
}

export async function updateFaqAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({
      faqId: z.uuid(), question: z.string().trim().min(1), answer: z.string().trim(),
      binding: z.enum(["bound", "unbound"]), category: z.string().trim().max(64).optional(), experienceId: z.union([z.uuid(), z.literal("")]).optional(),
    }).parse({
      faqId: formData.get("faqId"), question: formData.get("question"), answer: formData.get("answer"),
      binding: formData.get("binding"), category: formData.get("category") ?? undefined, experienceId: formData.get("experienceId") ?? undefined,
    });
    await updateFaq({
      userId: (await getCurrentActor()).userId,
      faqId: data.faqId,
      item: {
        question: data.question,
        answer: data.answer,
        binding: data.binding,
        category: data.category || null,
        experienceId: data.binding === "bound" ? data.experienceId || null : null,
      },
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
    await deleteFaq({ userId: (await getCurrentActor()).userId, faqId: z.uuid().parse(formData.get("faqId")) });
    revalidatePath("/faq");
    revalidatePath("/experiences/[id]", "page");
    revalidatePath("/interviews/[id]", "page");
    return { error: null, success: "FAQ 已删除。" };
  } catch (error) {
    logServerError("Failed to delete FAQ", error);
    return { error: "FAQ 删除失败。", success: null };
  }
}

export async function createFaqCategoryAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({ name: z.string().trim().min(1).max(64) }).parse({ name: formData.get("name") });
    await createFaqCategory({ userId: (await getCurrentActor()).userId, ...data });
    revalidateFaqViews();
    return { error: null, success: "分类已新增。" };
  } catch (error) {
    logServerError("Failed to create FAQ category", error);
    return { error: categoryActionError(error, "分类新增失败。"), success: null };
  }
}

export async function renameFaqCategoryAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({
      currentName: z.string().trim().min(1).max(64),
      nextName: z.string().trim().min(1).max(64),
    }).parse({
      currentName: formData.get("currentName"),
      nextName: formData.get("nextName"),
    });
    await renameFaqCategory({ userId: (await getCurrentActor()).userId, ...data });
    revalidateFaqViews();
    return { error: null, success: "分类已重命名，历史 FAQ 已同步更新。" };
  } catch (error) {
    logServerError("Failed to rename FAQ category", error);
    return { error: categoryActionError(error, "分类重命名失败。"), success: null };
  }
}

export async function deleteFaqCategoryAction(_state: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  try {
    const data = z.object({ name: z.string().trim().min(1).max(64) }).parse({ name: formData.get("name") });
    const result = await deleteFaqCategory({ userId: (await getCurrentActor()).userId, ...data });
    revalidateFaqViews();
    return {
      error: null,
      success: result.resetFaqCount
        ? `分类已删除，${result.resetFaqCount} 条历史 FAQ 已重置为“暂不设置”。`
        : "分类已删除。",
    };
  } catch (error) {
    logServerError("Failed to delete FAQ category", error);
    return { error: categoryActionError(error, "分类删除失败。"), success: null };
  }
}

function revalidateFaqViews() {
  revalidatePath("/faq");
  revalidatePath("/experiences/[id]", "page");
  revalidatePath("/interviews/[id]", "page");
}

function categoryActionError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.startsWith("CONFLICT:")) return "已存在这个分类。";
  if (error instanceof Error && error.message.startsWith("NOT_FOUND:")) return "该分类不存在或已被删除。";
  if (error instanceof Error && error.message.startsWith("VALIDATION_ERROR:")) return "分类名称不能为空、不能超过 64 个字，也不能命名为“暂不设置”。";
  return fallback;
}
