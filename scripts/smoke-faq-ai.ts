import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabaseRuntime } from "../src/db/runtime";
import { faqOccurrences, faqs, interviews, jobTracks, users } from "../src/db/schema";
import { commitFaqBatch, createExperience, updateFaq } from "../src/modules/interview-knowledge/service";
import { createFaqImportBatch, executeFaqImportAnalysis, finalizeFaqImportBatch, generateFaqImportAnswer, getFaqImportReview, retryFaqImportAnalysis } from "../src/modules/interview-knowledge/faq-import";
import { getExperienceDetail, getInterviewKnowledgeDetail, getKnowledgeLibrary } from "../src/modules/interview-knowledge/queries";
import type { FaqSimilarityGateway } from "../src/modules/interview-knowledge/faq-ai";

config({ path: [".env.local", ".env"], quiet: true });
const db = getDatabaseRuntime().db;
const userId = randomUUID();
const otherUserId = randomUUID();
const jobId = randomUUID();
const firstInterview = randomUUID();
const secondInterview = randomUUID();
try {
  await db.insert(users).values([userId, otherUserId].map((id) => ({ id, name: "FAQ AI smoke", email: `${id}@faq-smoke.invalid` })));
  await db.insert(jobTracks).values({ id: jobId, userId, companyName: "FAQ 验收公司", roleName: "测试岗位" });
  await db.insert(interviews).values([firstInterview, secondInterview].map((id, index) => ({ id, jobTrackId: jobId, roundLabel: `${index + 1} 面`, interviewType: "技术面", startAt: new Date(), endAt: new Date(Date.now() + 3600000) })));
  const experience = await createExperience({ userId, name: "缓存项目", content: "测试经历隔离" });
  const original = await commitFaqBatch({ userId, idempotencyKey: randomUUID(), interviewId: firstInterview, committedAt: new Date().toISOString(), items: [{ question: "如何设计缓存？", answer: "原答案", binding: "bound", category: null, experienceId: experience.id }] });
  const targetId = original.faqIds[0];
  const gateway: FaqSimilarityGateway = {
    async findClosestMatches(request) { return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: request.candidates.some((candidate) => candidate.id === targetId) ? targetId : null })); },
    async mergeAnswers(request) { assert.deepEqual(request.answers, ["原答案", "新答案一", "新答案二"]); return "人工可编辑的 AI 合并答案"; },
  };
  const batch = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: secondInterview, items: [
    { question: "缓存方案是什么？", answer: "新答案一", binding: "bound", category: null, experienceId: experience.id },
    { question: "缓存架构如何设计？", answer: "新答案二", binding: "bound", category: null, experienceId: experience.id },
    { question: "你的职业规划？", answer: "", binding: "unbound", category: null, experienceId: null },
  ] });
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, 1);
  await executeFaqImportAnalysis(userId, batch.batchId, gateway);
  const review = await getFaqImportReview(userId, batch.batchId);
  assert.equal(review.status, "review");
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, 1, "分析不应写入 FAQ");
  const mergedIds = review.items.slice(0, 2).map((item) => item.id);
  assert.equal(await generateFaqImportAnswer({ userId, batchId: batch.batchId, targetFaqId: targetId, itemIds: mergedIds }, gateway), "人工可编辑的 AI 合并答案");
  const decision = { newItemIds: [review.items[2].id], merges: [{ targetFaqId: targetId, itemIds: mergedIds, answer: "最终确认的答案", expectedUpdatedAt: review.targets[0].updatedAt }] };
  const results = await Promise.all([1, 2].map(() => finalizeFaqImportBatch({ userId, batchId: batch.batchId, decision })));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].mergedCount, 2);
  const accumulated = (await getExperienceDetail(userId, experience.id)).faqs[0];
  assert.equal(accumulated.frequency, 3);
  assert.equal(accumulated.answer, "最终确认的答案");
  assert.equal(accumulated.question, "如何设计缓存？ / 缓存方案是什么？ / 缓存架构如何设计？");
  assert.equal(accumulated.sources.length, 2);
  assert.equal((await getInterviewKnowledgeDetail(userId, firstInterview)).faqs.filter((faq) => faq.id === targetId).length, 1);
  assert.equal((await getInterviewKnowledgeDetail(userId, secondInterview)).faqs.filter((faq) => faq.id === targetId).length, 1);
  await assert.rejects(getFaqImportReview(otherUserId, batch.batchId), /NOT_FOUND/);
  await assert.rejects(finalizeFaqImportBatch({ userId: otherUserId, batchId: batch.batchId, decision }), /NOT_FOUND/);

  const noMatch = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [{ question: "完全不同的新问题", answer: "", binding: "unbound", category: null, experienceId: null }] });
  await executeFaqImportAnalysis(userId, noMatch.batchId, { ...gateway, async findClosestMatches(request) { return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: null })); } });
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, 2, "没有相似项也必须等待确认");
  const noMatchReview = await getFaqImportReview(userId, noMatch.batchId);
  await finalizeFaqImportBatch({ userId, batchId: noMatch.batchId, decision: { newItemIds: noMatchReview.items.map((item) => item.id), merges: [] } });

  const failed = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [{ question: "失败后直接导入", answer: "", binding: "unbound", category: null, experienceId: null }] });
  await executeFaqImportAnalysis(userId, failed.batchId, { ...gateway, async findClosestMatches() { throw new Error("AI_UNAVAILABLE: 模拟超时"); } });
  assert.equal((await getFaqImportReview(userId, failed.batchId)).status, "failed");
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, 3);
  const fallbackInput = { userId, batchId: failed.batchId, decision: { newItemIds: [], merges: [] }, withoutAnalysis: true };
  const fallback = await finalizeFaqImportBatch(fallbackInput);
  assert.equal(fallback.importedCount, 1);
  assert.equal((await getFaqImportReview(userId, failed.batchId)).status, "completed");
  let callsAfterFallback = 0;
  await executeFaqImportAnalysis(userId, failed.batchId, { ...gateway, async findClosestMatches() { callsAfterFallback++; return []; } });
  assert.equal(callsAfterFallback, 0, "跳过 AI 导入完成后，滞后的分析请求不能重新调用 AI");
  assert.deepEqual(await finalizeFaqImportBatch(fallbackInput), fallback, "重复确认不能新增重复 FAQ");
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, 4);

  const resumable = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [
    { question: "断点测试第一条", answer: "", binding: "unbound", category: null, experienceId: null },
    { question: "断点测试第二条", answer: "", binding: "unbound", category: null, experienceId: null },
  ] });
  const requestedQuestions: string[] = [];
  const resumableGateway: FaqSimilarityGateway = { ...gateway, async findClosestMatches(request) {
    assert.equal(request.incoming.length, 1);
    requestedQuestions.push(request.incoming[0].question);
    if (requestedQuestions.length === 2) throw new Error("AI_UNAVAILABLE: 模拟限流");
    return [{ incomingFaqId: request.incoming[0].id, existingFaqId: null }];
  } };
  await executeFaqImportAnalysis(userId, resumable.batchId, resumableGateway);
  const interrupted = await getFaqImportReview(userId, resumable.batchId);
  assert.equal(interrupted.status, "failed");
  assert.equal(interrupted.matches.length, 1, "每条完成后立即保存结果，包括无匹配项");
  await retryFaqImportAnalysis(userId, resumable.batchId);
  await executeFaqImportAnalysis(userId, resumable.batchId, resumableGateway);
  const resumed = await getFaqImportReview(userId, resumable.batchId);
  assert.equal(resumed.status, "review");
  assert.equal(resumed.matches.length, 2);
  assert.deepEqual(requestedQuestions, ["断点测试第一条", "断点测试第二条", "断点测试第二条"]);
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, 4, "重试完成仍须等待手动确认");
  await finalizeFaqImportBatch({ userId, batchId: resumable.batchId, decision: { newItemIds: resumed.items.map((item) => item.id), merges: [] } });

  const pendingFallback = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [{ question: "连接失败时直接导入", answer: "", binding: "unbound", category: null, experienceId: null }] });
  const pendingResult = await finalizeFaqImportBatch({ userId, batchId: pendingFallback.batchId, decision: { newItemIds: [], merges: [] }, withoutAnalysis: true });
  assert.equal(pendingResult.importedCount, 1, "前端连接失败时，仍待分析的批次也允许人工跳过导入");

  const editing = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: firstInterview, items: [
    { question: "编辑前第一条", answer: "旧答案", binding: "unbound", category: null, experienceId: null },
    { question: "编辑前第二条", answer: "", binding: "unbound", category: null, experienceId: null },
  ] });
  const startedEditing = Promise.withResolvers<void>();
  const releaseEditing = Promise.withResolvers<void>();
  let obsoleteCalls = 0;
  const obsoleteAnalysis = executeFaqImportAnalysis(userId, editing.batchId, { ...gateway, async findClosestMatches(request) {
    obsoleteCalls++;
    startedEditing.resolve();
    await releaseEditing.promise;
    return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: null }));
  } });
  await startedEditing.promise;
  const revisedInput = { userId, replaceBatchId: editing.batchId, idempotencyKey: randomUUID(), interviewId: secondInterview, items: [
    { question: "编辑后的问题", answer: "编辑后的答案", binding: "bound" as const, category: null, experienceId: experience.id },
  ] };
  try {
    await assert.rejects(createFaqImportBatch({ ...revisedInput, userId: otherUserId }), /NOT_FOUND/);
    assert.equal((await createFaqImportBatch(revisedInput)).batchId, editing.batchId);
    assert.equal((await createFaqImportBatch(revisedInput)).batchId, editing.batchId, "相同编辑提交重试不重复创建批次");
  } finally {
    releaseEditing.resolve();
    await obsoleteAnalysis;
  }
  const editedReview = await getFaqImportReview(userId, editing.batchId);
  assert.equal(obsoleteCalls, 1, "旧分析失效后不继续调用后续条目");
  assert.equal(editedReview.status, "pending", "旧分析结果不能覆盖新编辑批次");
  assert.equal(editedReview.matches.length, 0);
  assert.equal(editedReview.items[0].question, "编辑后的问题");
  assert.equal(editedReview.sourceInterviewId, secondInterview);
  await executeFaqImportAnalysis(userId, editing.batchId, gateway);
  assert.equal((await getFaqImportReview(userId, editing.batchId)).status, "review");
  const directRevision = { ...revisedInput, idempotencyKey: randomUUID(), withoutAnalysis: true, items: [{ ...revisedInput.items[0], answer: "最终直接导入的答案" }] };
  await createFaqImportBatch(directRevision);
  const finalEditedInput = { userId, batchId: editing.batchId, decision: { newItemIds: [], merges: [] }, withoutAnalysis: true };
  const editedResult = await finalizeFaqImportBatch(finalEditedInput);
  assert.equal(editedResult.importedCount, 1);
  await createFaqImportBatch(directRevision);
  assert.deepEqual(await finalizeFaqImportBatch(finalEditedInput), editedResult);
  await assert.rejects(createFaqImportBatch({ ...directRevision, idempotencyKey: randomUUID() }), /CONFLICT/);
  const editedFaq = (await getExperienceDetail(userId, experience.id)).faqs.find((faq) => faq.id === editedResult.faqIds[0]);
  assert.equal(editedFaq?.answer, "最终直接导入的答案");
  assert.equal(editedFaq?.frequency, 1);
  assert.equal(editedFaq?.sources.length, 1);

  const activeFallback = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [
    { question: "后台仍在运行时跳过", answer: "", binding: "unbound", category: null, experienceId: null },
    { question: "后台第二条不应执行", answer: "", binding: "unbound", category: null, experienceId: null },
  ] });
  const activeStarted = Promise.withResolvers<void>();
  const activeRelease = Promise.withResolvers<void>();
  let activeCalls = 0;
  const activeRun = executeFaqImportAnalysis(userId, activeFallback.batchId, { ...gateway, async findClosestMatches(request) {
    activeCalls++;
    activeStarted.resolve();
    await activeRelease.promise;
    return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: null }));
  } });
  await activeStarted.promise;
  try {
    const result = await finalizeFaqImportBatch({ userId, batchId: activeFallback.batchId, decision: { newItemIds: [], merges: [] }, withoutAnalysis: true });
    assert.equal(result.importedCount, 2);
  } finally {
    activeRelease.resolve();
    await activeRun;
  }
  assert.equal(activeCalls, 1);
  assert.equal((await getFaqImportReview(userId, activeFallback.batchId)).status, "completed", "运行中的旧请求不能改变已完成导入");

  const groupedInput = { userId, idempotencyKey: randomUUID(), interviewId: null, committedAt: new Date().toISOString(), items: [
    { groupId: "first", sourceInterviewId: firstInterview, question: "分组事务问题一", answer: "", binding: "bound" as const, category: null, experienceId: experience.id },
    { groupId: "second", sourceInterviewId: secondInterview, question: "分组事务问题二", answer: "", binding: "unbound" as const, category: null, experienceId: null },
    { groupId: "none", sourceInterviewId: null, question: "分组事务无来源", answer: "", binding: "unbound" as const, category: null, experienceId: null },
  ] };
  const [groupedDirect, repeatedDirect] = await Promise.all([commitFaqBatch(groupedInput), commitFaqBatch(groupedInput)]);
  assert.deepEqual(groupedDirect, repeatedDirect, "分组直接保存的并发重试不能重复录入");
  const directOccurrences = await db.select().from(faqOccurrences).where(inArray(faqOccurrences.faqId, groupedDirect.faqIds));
  assert.equal(directOccurrences.length, 3);
  groupedDirect.faqIds.forEach((id, index) => assert.equal(directOccurrences.find((row) => row.faqId === id)?.sourceInterviewId, groupedInput.items[index].sourceInterviewId));

  const foreignJob = randomUUID();
  const foreignInterview = randomUUID();
  await db.insert(jobTracks).values({ id: foreignJob, userId: otherUserId, companyName: "隔离测试", roleName: "测试" });
  await db.insert(interviews).values({ id: foreignInterview, jobTrackId: foreignJob, roundLabel: "测试面试", interviewType: "技术面", startAt: new Date(), endAt: new Date(Date.now() + 3600000) });
  const countBeforeRejected = (await getKnowledgeLibrary(userId)).totalFaqCount;
  const foreignItems = [groupedInput.items[0], { ...groupedInput.items[1], sourceInterviewId: foreignInterview }];
  await assert.rejects(commitFaqBatch({ ...groupedInput, idempotencyKey: randomUUID(), items: foreignItems }), /NOT_FOUND/);
  await assert.rejects(createFaqImportBatch({ ...groupedInput, idempotencyKey: randomUUID(), items: foreignItems }), /VALIDATION_ERROR/);
  assert.equal((await getKnowledgeLibrary(userId)).totalFaqCount, countBeforeRejected, "任一组越权时整批不得部分保存");

  const groupedTarget = groupedDirect.faqIds[0];
  const groupedBatch = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [
    ...[firstInterview, secondInterview, null].map((sourceInterviewId, index) => ({ groupId: `merge-${index}`, sourceInterviewId, question: `合并组 ${index}`, answer: "", binding: "bound" as const, category: null, experienceId: experience.id })),
    { groupId: "new", sourceInterviewId: secondInterview, question: "分组新增问题", answer: "", binding: "unbound", category: null, experienceId: null },
  ] });
  const stagedGroups = await getFaqImportReview(userId, groupedBatch.batchId);
  assert.deepEqual(stagedGroups.items.map((item) => item.groupId), ["merge-0", "merge-1", "merge-2", "new"]);
  assert.deepEqual(stagedGroups.items.map((item) => item.sourceInterviewId), [firstInterview, secondInterview, null, secondInterview]);
  await executeFaqImportAnalysis(userId, groupedBatch.batchId, { ...gateway, async findClosestMatches(request) { return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: request.candidates.some((candidate) => candidate.id === groupedTarget) ? groupedTarget : null })); } });
  const groupedReview = await getFaqImportReview(userId, groupedBatch.batchId);
  const groupedResult = await finalizeFaqImportBatch({ userId, batchId: groupedBatch.batchId, decision: { newItemIds: [groupedReview.items[3].id], merges: [{ targetFaqId: groupedTarget, itemIds: groupedReview.items.slice(0, 3).map((item) => item.id), answer: "分组最终答案", expectedUpdatedAt: groupedReview.targets[0].updatedAt }] } });
  assert.equal(groupedResult.mergedCount, 3);
  assert.equal(groupedResult.importedCount, 1);
  const mergedOccurrences = await db.select().from(faqOccurrences).where(eq(faqOccurrences.faqId, groupedTarget));
  assert.equal(mergedOccurrences.length, 4);
  assert.equal(mergedOccurrences.filter((row) => row.sourceInterviewId === null).length, 1);
  assert.equal(mergedOccurrences.filter((row) => row.sourceInterviewId === secondInterview).length, 1);
  const newlyCreatedId = groupedResult.faqIds.find((id) => id !== groupedTarget)!;
  assert.equal((await db.select().from(faqOccurrences).where(eq(faqOccurrences.faqId, newlyCreatedId)))[0].sourceInterviewId, secondInterview);

  const conflict = await createFaqImportBatch({ userId, idempotencyKey: randomUUID(), interviewId: null, items: [{ question: "缓存如何实现？", answer: "", binding: "bound", category: null, experienceId: experience.id }] });
  await executeFaqImportAnalysis(userId, conflict.batchId, gateway);
  const staleReview = await getFaqImportReview(userId, conflict.batchId);
  await updateFaq({ userId, faqId: targetId, item: { question: accumulated.question, answer: "另一处更新的答案", binding: "bound", category: null, experienceId: experience.id } });
  await assert.rejects(finalizeFaqImportBatch({ userId, batchId: conflict.batchId, decision: { newItemIds: [], merges: [{ targetFaqId: targetId, itemIds: staleReview.items.map((item) => item.id), answer: "不能覆盖", expectedUpdatedAt: staleReview.targets[0].updatedAt }] } }), /CONFLICT/);
  assert.equal((await getExperienceDetail(userId, experience.id)).faqs.find((faq) => faq.id === targetId)?.frequency, 3);
  console.info("FAQ AI PostgreSQL smoke passed: staging, manual confirmation, merge, sources, frequency, idempotency, isolation, failure fallback, sequential checkpoints and retry, draft revision, obsolete analysis fencing, conflict protection");
} finally {
  await db.delete(faqs).where(inArray(faqs.userId, [userId, otherUserId]));
  await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
  await getDatabaseRuntime().close();
}
