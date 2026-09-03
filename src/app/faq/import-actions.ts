"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { createFaqImportBatch, faqImportErrorMessage, finalizeFaqImportBatch, generateFaqImportAnswer, retryFaqImportAnalysis } from "@/modules/interview-knowledge/faq-import";

function parseImportForm(formData: FormData) {
  const data = z.object({
    idempotencyKey: z.string().min(8).max(255), interviewId: z.uuid(), itemsJson: z.string().max(1_000_000), replaceBatchId: z.uuid().optional(),
  }).parse(Object.fromEntries(formData));
  const items = z.array(z.object({ question: z.string().trim().min(1).max(10_000), answer: z.string().trim().max(100_000), binding: z.enum(["bound", "unbound"]), category: z.string().max(64).nullable(), experienceId: z.uuid().nullable() })).min(1).max(100).parse(JSON.parse(data.itemsJson));
  return { idempotencyKey: data.idempotencyKey, interviewId: data.interviewId, items, replaceBatchId: data.replaceBatchId };
}

export async function beginFaqAnalysis(formData: FormData) {
  try {
    const result = await createFaqImportBatch({ userId: (await getCurrentActor()).userId, ...parseImportForm(formData) });
    return { batchId: result.batchId, error: null };
  } catch (error) {
    return { batchId: null, error: faqImportErrorMessage(error) };
  }
}

export async function importEditedFaqBatch(formData: FormData) {
  try {
    const data = parseImportForm(formData);
    if (!data.replaceBatchId) throw new Error("VALIDATION_ERROR: 待编辑的批次不存在。");
    const batch = await createFaqImportBatch({ userId: (await getCurrentActor()).userId, ...data, withoutAnalysis: true });
    return await confirmFaqImport(batch.batchId, { newItemIds: [], merges: [] }, true);
  } catch (error) { return { result: null, error: faqImportErrorMessage(error) }; }
}

export async function retryFaqAnalysis(batchId: string) {
  try {
    await retryFaqImportAnalysis((await getCurrentActor()).userId, z.uuid().parse(batchId));
    return { error: null };
  } catch (error) { return { error: faqImportErrorMessage(error) }; }
}

export async function confirmFaqImport(batchId: string, decision: unknown, withoutAnalysis = false) {
  try {
    const parsed = z.object({ newItemIds: z.array(z.uuid()).max(100), merges: z.array(z.object({ targetFaqId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(100), answer: z.string().max(100_000), expectedUpdatedAt: z.iso.datetime() })).max(100) }).parse(decision);
    const result = await finalizeFaqImportBatch({ userId: (await getCurrentActor()).userId, batchId: z.uuid().parse(batchId), decision: parsed, withoutAnalysis: z.boolean().parse(withoutAnalysis) });
    revalidatePath("/faq");
    revalidatePath("/experiences/[id]", "page");
    revalidatePath("/interviews/[id]", "page");
    revalidatePath("/jobs/[id]", "page");
    revalidatePath("/");
    return { result, error: null };
  } catch (error) { return { result: null, error: faqImportErrorMessage(error) }; }
}

export async function generateFaqAnswer(batchId: string, targetFaqId: string, itemIds: string[]) {
  try {
    const data = z.object({ batchId: z.uuid(), targetFaqId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(100) }).parse({ batchId, targetFaqId, itemIds });
    const answer = await generateFaqImportAnswer({ ...data, userId: (await getCurrentActor()).userId });
    return { answer, error: null };
  } catch (error) { return { answer: null, error: faqImportErrorMessage(error) }; }
}
