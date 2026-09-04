import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { getDatabaseRuntime } from "@/db/runtime";
import { events, experiences, faqImportBatches, faqOccurrences, faqs, interviews, jobTracks, users } from "@/db/schema";
import { createFaqAiGateway } from "@/adapters/ai/openai-compatible-faq";
import { analyzeFaqSimilarity, type FaqSimilarityGateway } from "./faq-ai";
import { faqSourceInterviewId, validateFaqBatch, type FaqImportItem } from "./faq-batch";
import { prepareFaqMerge } from "./faq-merge";
import { assertFaqCategoriesSupported } from "./service";

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export type FaqImportDecision = {
  newItemIds: string[];
  merges: Array<{ targetFaqId: string; itemIds: string[]; answer: string; expectedUpdatedAt: string }>;
};

export async function createFaqImportBatch(input: { userId: string; idempotencyKey: string; interviewId: string | null; items: FaqImportItem[]; replaceBatchId?: string; withoutAnalysis?: boolean }) {
  return getDatabaseRuntime().db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update");
    const [existing] = await tx.select().from(faqImportBatches).where(and(eq(faqImportBatches.userId, input.userId), eq(faqImportBatches.idempotencyKey, input.idempotencyKey)));
    if (existing) return { batchId: existing.id };
    if (input.replaceBatchId) {
      const [previous] = await tx.select().from(faqImportBatches).where(and(eq(faqImportBatches.id, input.replaceBatchId), eq(faqImportBatches.userId, input.userId))).for("update");
      if (!previous) throw new Error("NOT_FOUND: FAQ 导入批次不存在。");
      if (previous.status === "completed") throw new Error("CONFLICT: 这批 FAQ 已导入，请刷新知识库查看。");
      const items = validateFaqBatch(input.items);
      await assertReferences(tx, input.userId, input.interviewId, input.items);
      await tx.update(faqImportBatches).set({
        idempotencyKey: input.idempotencyKey, sourceInterviewId: input.interviewId,
        items: items.map((item, index) => ({ ...item, id: randomUUID(), binding: item.experienceId ? "bound" as const : "unbound" as const, groupId: input.items[index].groupId, sourceInterviewId: faqSourceInterviewId(input.items[index], input.interviewId) })),
        status: input.withoutAnalysis ? "failed" : "pending", matches: null, result: null,
        errorMessage: null, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(eq(faqImportBatches.id, previous.id));
      return { batchId: previous.id };
    }
    const [active] = await tx.select({ id: faqImportBatches.id }).from(faqImportBatches).where(and(eq(faqImportBatches.userId, input.userId), ne(faqImportBatches.status, "completed"))).limit(1);
    if (active) throw new Error("CONFLICT: 请先完成已有的 FAQ 导入批次。");
    const items = validateFaqBatch(input.items);
    await assertReferences(tx, input.userId, input.interviewId, input.items);
    const id = randomUUID();
    await tx.insert(faqImportBatches).values({
      id, userId: input.userId, idempotencyKey: input.idempotencyKey, sourceInterviewId: input.interviewId,
      items: items.map((item, index) => ({ ...item, id: randomUUID(), binding: item.experienceId ? "bound" as const : "unbound" as const, groupId: input.items[index].groupId, sourceInterviewId: faqSourceInterviewId(input.items[index], input.interviewId) })),
      status: input.withoutAnalysis ? "failed" : "pending",
    });
    return { batchId: id };
  });
}

export async function getFaqImportBatch(userId: string, batchId: string) {
  const [batch] = await getDatabaseRuntime().db.select().from(faqImportBatches)
    .where(and(eq(faqImportBatches.userId, userId), eq(faqImportBatches.id, batchId)));
  if (!batch) throw new Error("NOT_FOUND: FAQ 导入批次不存在。");
  return batch;
}

export async function getActiveFaqImportBatch(userId: string) {
  const [batch] = await getDatabaseRuntime().db.select({ id: faqImportBatches.id, status: faqImportBatches.status }).from(faqImportBatches)
    .where(and(eq(faqImportBatches.userId, userId), ne(faqImportBatches.status, "completed"))).orderBy(desc(faqImportBatches.createdAt)).limit(1);
  return batch ?? null;
}

export async function retryFaqImportAnalysis(userId: string, batchId: string) {
  await getFaqImportBatch(userId, batchId);
  await getDatabaseRuntime().db.update(faqImportBatches).set({ status: "pending", errorMessage: null, updatedAt: new Date() })
    .where(and(eq(faqImportBatches.id, batchId), eq(faqImportBatches.userId, userId), eq(faqImportBatches.status, "failed")));
}

export async function executeFaqImportAnalysis(userId: string, batchId: string, gateway?: FaqSimilarityGateway) {
  const db = getDatabaseRuntime().db;
  const token = randomUUID();
  const [batch] = await db.update(faqImportBatches).set({ status: "analyzing", errorMessage: null, leaseToken: token, leaseExpiresAt: new Date(Date.now() + 90_000), updatedAt: new Date() })
    .where(and(eq(faqImportBatches.id, batchId), eq(faqImportBatches.userId, userId), or(eq(faqImportBatches.status, "pending"), and(eq(faqImportBatches.status, "analyzing"), lt(faqImportBatches.leaseExpiresAt, new Date()))))).returning();
  if (!batch) return;
  const ownedLease = and(eq(faqImportBatches.id, batchId), eq(faqImportBatches.leaseToken, token), eq(faqImportBatches.status, "analyzing"));
  const heartbeat = setInterval(() => {
    void db.update(faqImportBatches).set({ leaseExpiresAt: new Date(Date.now() + 90_000) }).where(ownedLease).catch(() => undefined);
  }, 25_000);
  try {
    const existing = await db.select({ id: faqs.id, question: faqs.question, experienceId: faqs.experienceId }).from(faqs).where(eq(faqs.userId, userId));
    const matches = [...(batch.matches ?? [])];
    const completedIds = new Set(matches.map((match) => match.incomingFaqId));
    const remaining = batch.items.filter((item) => !completedIds.has(item.id));
    if (remaining.length) {
      await analyzeFaqSimilarity({ incoming: remaining, existing }, gateway ?? createFaqAiGateway(undefined, undefined, { userId, batchId }), async (match) => {
        matches.push(match);
        const saved = await db.update(faqImportBatches).set({ matches: [...matches], updatedAt: new Date() })
          .where(ownedLease).returning({ id: faqImportBatches.id });
        if (!saved.length) throw new Error("CONFLICT: 分析任务已由另一进程接管。");
      });
    }
    await db.update(faqImportBatches).set({ status: "review", matches, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(ownedLease);
  } catch (error) {
    await db.update(faqImportBatches).set({ status: "failed", errorMessage: faqImportErrorMessage(error), leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(ownedLease);
  } finally {
    clearInterval(heartbeat);
  }
}

export async function executeNextFaqImportAnalysis() {
  const [next] = await getDatabaseRuntime().db.select({ id: faqImportBatches.id, userId: faqImportBatches.userId }).from(faqImportBatches)
    .where(or(eq(faqImportBatches.status, "pending"), and(eq(faqImportBatches.status, "analyzing"), lt(faqImportBatches.leaseExpiresAt, new Date()))))
    .orderBy(asc(faqImportBatches.createdAt)).limit(1);
  if (!next) return false;
  await executeFaqImportAnalysis(next.userId, next.id);
  return true;
}

export async function getFaqImportReview(userId: string, batchId: string) {
  const batch = await getFaqImportBatch(userId, batchId);
  const ids = [...new Set((batch.matches ?? []).flatMap((match) => match.existingFaqId ? [match.existingFaqId] : []))];
  const targets = ids.length ? await getDatabaseRuntime().db.select({
    id: faqs.id, question: faqs.question, answer: faqs.answer, category: faqs.category, experienceId: faqs.experienceId,
    experienceName: experiences.name, updatedAt: faqs.updatedAt,
    frequency: sql<number>`(SELECT count(*)::int FROM ${faqOccurrences} WHERE ${faqOccurrences.faqId} = ${faqs.id})`,
  }).from(faqs).leftJoin(experiences, eq(experiences.id, faqs.experienceId)).where(and(eq(faqs.userId, userId), inArray(faqs.id, ids))) : [];
  const experienceRows = await getDatabaseRuntime().db.select({ id: experiences.id, name: experiences.name }).from(experiences).where(eq(experiences.userId, userId));
  const sourceIds = [...new Set(batch.items.flatMap((item) => {
    const id = faqSourceInterviewId(item, batch.sourceInterviewId);
    return id ? [id] : [];
  }))];
  const sourceRows = sourceIds.length ? await getDatabaseRuntime().db.select({ id: interviews.id, companyName: jobTracks.companyName, roleName: jobTracks.roleName, roundLabel: interviews.roundLabel })
    .from(interviews).innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
    .where(and(eq(jobTracks.userId, userId), inArray(interviews.id, sourceIds))) : [];
  return {
    id: batch.id, status: batch.status, errorMessage: batch.errorMessage, sourceInterviewId: batch.sourceInterviewId,
    items: batch.items.map((item) => {
      const sourceInterviewId = faqSourceInterviewId(item, batch.sourceInterviewId);
      const source = sourceRows.find((row) => row.id === sourceInterviewId);
      return { ...item, sourceInterviewId, sourceInterviewLabel: source ? `${source.companyName} · ${source.roleName} · ${source.roundLabel}` : sourceInterviewId ? "来源面试已删除" : "无来源面试", experienceName: experienceRows.find((experience) => experience.id === item.experienceId)?.name ?? null };
    }),
    matches: batch.matches ?? [], targets: targets.map((target) => ({ ...target, updatedAt: target.updatedAt.toISOString() })),
  };
}

export async function generateFaqImportAnswer(input: { userId: string; batchId: string; targetFaqId: string; itemIds: string[] }, gateway?: FaqSimilarityGateway) {
  const batch = await getFaqImportBatch(input.userId, input.batchId);
  if (batch.status !== "review") throw new Error("CONFLICT: 当前批次不在复核阶段。");
  const selected = batch.items.filter((item) => input.itemIds.includes(item.id));
  if (!selected.length || selected.length !== new Set(input.itemIds).size || selected.some((item) => batch.matches?.find((match) => match.incomingFaqId === item.id)?.existingFaqId !== input.targetFaqId)) throw new Error("VALIDATION_ERROR: 合并选择无效。");
  const [target] = await getDatabaseRuntime().db.select().from(faqs).where(and(eq(faqs.userId, input.userId), eq(faqs.id, input.targetFaqId)));
  if (!target || selected.some((item) => item.experienceId !== target.experienceId)) throw new Error("CONFLICT: 匹配的 FAQ 已变化，请刷新页面。");
  return (gateway ?? createFaqAiGateway(undefined, undefined, { userId: input.userId, batchId: input.batchId })).mergeAnswers({ question: prepareFaqMerge({ ...target, frequency: 0 }, selected, "").question, answers: [target.answer, ...selected.map((item) => item.answer)] });
}

export async function finalizeFaqImportBatch(input: { userId: string; batchId: string; decision: FaqImportDecision; withoutAnalysis?: boolean }) {
  return getDatabaseRuntime().db.transaction(async (tx) => {
    const [batch] = await tx.select().from(faqImportBatches).where(and(eq(faqImportBatches.id, input.batchId), eq(faqImportBatches.userId, input.userId))).for("update");
    if (!batch) throw new Error("NOT_FOUND: FAQ 导入批次不存在。");
    if (batch.status === "completed" && batch.result) return batch.result;
    if (batch.status === "completed" || (!input.withoutAnalysis && batch.status !== "review")) throw new Error("CONFLICT: 当前批次尚不能确认导入。");
    await assertReferences(tx, input.userId, batch.sourceInterviewId, batch.items);
    const decision = input.withoutAnalysis ? { newItemIds: batch.items.map((item) => item.id), merges: [] } : input.decision;
    const selectedIds = [...decision.newItemIds, ...decision.merges.flatMap((merge) => merge.itemIds)];
    if (selectedIds.length !== batch.items.length || new Set(selectedIds).size !== batch.items.length || selectedIds.some((id) => !batch.items.some((item) => item.id === id))) throw new Error("VALIDATION_ERROR: 请决定每条 FAQ 是合并还是作为新 FAQ 导入。");
    const targetIds = decision.merges.map((merge) => merge.targetFaqId);
    if (new Set(targetIds).size !== targetIds.length) throw new Error("VALIDATION_ERROR: 同一目标 FAQ 必须在同一组处理。");
    const targets = targetIds.length ? await tx.select().from(faqs).where(and(eq(faqs.userId, input.userId), inArray(faqs.id, targetIds))).orderBy(asc(faqs.id)).for("update") : [];
    const faqIds: string[] = [];
    let mergedCount = 0;
    for (const merge of decision.merges) {
      const target = targets.find((faq) => faq.id === merge.targetFaqId);
      const items = batch.items.filter((item) => merge.itemIds.includes(item.id));
      if (!target || target.updatedAt.toISOString() !== merge.expectedUpdatedAt || items.some((item) => item.experienceId !== target.experienceId || batch.matches?.find((match) => match.incomingFaqId === item.id)?.existingFaqId !== target.id)) throw new Error("CONFLICT: 匹配的 FAQ 已被修改或删除，请刷新复核页后重新确认。");
      const merged = prepareFaqMerge({ ...target, frequency: 0 }, items, merge.answer);
      await tx.update(faqs).set({ question: merged.question, answer: merged.answer, updatedAt: new Date() }).where(eq(faqs.id, target.id));
      await tx.insert(faqOccurrences).values(items.map((item) => ({ faqId: target.id, sourceInterviewId: faqSourceInterviewId(item, batch.sourceInterviewId) })));
      faqIds.push(target.id);
      mergedCount += items.length;
    }
    const newItems = batch.items.filter((item) => decision.newItemIds.includes(item.id));
    if (newItems.length) {
      const rows = validateFaqBatch(newItems).map((item) => ({ ...item, id: randomUUID(), userId: input.userId }));
      await tx.insert(faqs).values(rows);
      await tx.insert(faqOccurrences).values(rows.map((item, index) => ({ faqId: item.id, sourceInterviewId: faqSourceInterviewId(newItems[index], batch.sourceInterviewId) })));
      faqIds.push(...rows.map((item) => item.id));
    }
    const sourceIds = [...new Set(batch.items.flatMap((item) => {
      const id = faqSourceInterviewId(item, batch.sourceInterviewId);
      return id ? [id] : [];
    }))].sort();
    for (const sourceId of sourceIds) {
      const [interview] = await tx.select().from(interviews).where(eq(interviews.id, sourceId)).for("update");
      if (interview && !interview.occurredAt) {
        const now = new Date();
        await tx.update(interviews).set({ occurredAt: now, updatedAt: now, version: sql`${interviews.version} + 1` }).where(eq(interviews.id, interview.id));
        await tx.insert(events).values({ userId: input.userId, jobTrackId: interview.jobTrackId, kind: "InterviewOccurred", subjectType: "interview", subjectId: interview.id, occurredAt: now, actionId: `${batch.id}:occurred:${interview.id}`, payload: { confirmedBy: "faq_batch" } });
      }
    }
    const result = { faqIds, importedCount: newItems.length, mergedCount };
    await tx.update(faqImportBatches).set({ status: "completed", result, items: [], matches: null, errorMessage: null, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(faqImportBatches.id, batch.id));
    return result;
  });
}

async function assertReferences(tx: Transaction, userId: string, interviewId: string | null, rawItems: FaqImportItem[]) {
  const items = validateFaqBatch(rawItems);
  const sourceIds = [...new Set(rawItems.flatMap((item) => {
    const id = faqSourceInterviewId(item, interviewId);
    return id ? [id] : [];
  }))];
  if (sourceIds.length) {
    const sources = await tx.select({ id: interviews.id, status: interviews.status }).from(interviews).innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId)).where(and(inArray(interviews.id, sourceIds), eq(jobTracks.userId, userId))).orderBy(asc(interviews.id)).for("update", { of: interviews });
    if (sources.length !== sourceIds.length || sources.some((source) => source.status === "cancelled")) throw new Error("VALIDATION_ERROR: 来源面试不存在或已取消。");
  }
  const ids = [...new Set(items.flatMap((item) => item.experienceId ? [item.experienceId] : []))];
  if (ids.length) {
    const owned = await tx.select({ id: experiences.id }).from(experiences).where(and(eq(experiences.userId, userId), inArray(experiences.id, ids)));
    if (owned.length !== ids.length) throw new Error("VALIDATION_ERROR: 关联经历不存在。");
  }
  await assertFaqCategoriesSupported(tx, userId, items);
}

export function faqImportErrorMessage(error: unknown) {
  if (error instanceof Error && /^(AI_NOT_CONFIGURED|AI_UNAVAILABLE|AI_INPUT_TOO_LARGE|AI_RESPONSE_INVALID|AI_LOG_UNAVAILABLE|CONFLICT|VALIDATION_ERROR|NOT_FOUND):/.test(error.message)) return error.message.replace(/^[A-Z_]+:\s*/, "");
  return "操作失败，请稍后重试。你的待导入内容仍然保留。";
}
