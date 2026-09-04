import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  actionReceipts,
  events,
  experiences,
  faqCategories,
  faqOccurrences,
  faqs,
  interviews,
  jobTracks,
  resumeExperiences,
  resumes,
  users,
} from "@/db/schema";
import type { AppDatabase } from "@/db/client";
import { getDatabaseRuntime } from "@/db/runtime";
import { defaultFaqCategories, faqSourceInterviewId, validateFaqBatch, type FaqBatchItem, type FaqImportItem, type ValidatedFaqBatchItem } from "./faq-batch";

type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export async function createExperience(input: {
  userId: string;
  name: string;
  content: string;
}) {
  const name = input.name.trim();
  const content = input.content.trim();
  if (!name || !content) throw new Error("VALIDATION_ERROR: experience name and content are required");
  const id = randomUUID();
  await getDatabaseRuntime().db.insert(experiences).values({ id, userId: input.userId, name, content });
  return { id, name, content };
}

export async function updateExperience(input: { userId: string; experienceId: string; name: string; content: string }) {
  const name = input.name.trim();
  const content = input.content.trim();
  if (!name || !content) throw new Error("VALIDATION_ERROR: experience name and content are required");
  const updated = await getDatabaseRuntime().db.update(experiences).set({ name, content, updatedAt: new Date() })
    .where(and(eq(experiences.id, input.experienceId), eq(experiences.userId, input.userId)))
    .returning({ id: experiences.id, name: experiences.name, content: experiences.content });
  if (!updated.length) throw new Error("NOT_FOUND: experience was not found");
  return updated[0];
}

export async function deleteExperience(input: { userId: string; experienceId: string }) {
  return getDatabaseRuntime().db.transaction(async (transaction) => {
    const [experience] = await transaction.select({ id: experiences.id }).from(experiences)
      .where(and(eq(experiences.id, input.experienceId), eq(experiences.userId, input.userId))).limit(1);
    if (!experience) throw new Error("NOT_FOUND: experience was not found");

    const [usage] = await transaction.select({ count: sql<number>`count(*)::int` }).from(faqs)
      .where(and(eq(faqs.userId, input.userId), eq(faqs.experienceId, experience.id)));
    const faqCount = usage?.count ?? 0;
    if (faqCount > 0) {
      return { outcome: "blocked" as const, faqCount };
    }

    await transaction.delete(experiences)
      .where(and(eq(experiences.id, experience.id), eq(experiences.userId, input.userId)));
    return { outcome: "deleted" as const };
  });
}

export async function setResumeExperiences(input: {
  userId: string;
  resumeId: string;
  experienceIds: string[];
}) {
  const uniqueIds = [...new Set(input.experienceIds)];
  await getDatabaseRuntime().db.transaction(async (transaction) => {
    const [resume] = await transaction.select({ id: resumes.id }).from(resumes)
      .where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, input.userId))).limit(1);
    if (!resume) throw new Error("NOT_FOUND: resume was not found");
    if (uniqueIds.length) {
      const owned = await transaction.select({ id: experiences.id }).from(experiences)
        .where(and(eq(experiences.userId, input.userId), inArray(experiences.id, uniqueIds)));
      if (owned.length !== uniqueIds.length) throw new Error("NOT_FOUND: one or more experiences were not found");
    }
    await transaction.delete(resumeExperiences).where(eq(resumeExperiences.resumeId, resume.id));
    if (uniqueIds.length) {
      await transaction.insert(resumeExperiences).values(
        uniqueIds.map((experienceId, sortOrder) => ({ resumeId: resume.id, experienceId, sortOrder })),
      );
    }
  });
}

export async function commitFaqBatch(input: {
  userId: string;
  idempotencyKey: string;
  interviewId: string | null;
  items: FaqImportItem[];
  committedAt: string;
}) {
  const items = validateFaqBatch(input.items);
  const committedAt = parseTimestamp(input.committedAt);
  return getDatabaseRuntime().db.transaction(async (transaction) => {
    await transaction.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update");
    const [receipt] = await transaction.select({ result: actionReceipts.result }).from(actionReceipts)
      .where(and(eq(actionReceipts.userId, input.userId), eq(actionReceipts.idempotencyKey, input.idempotencyKey))).limit(1);
    if (receipt) return receipt.result as { faqIds: string[]; interviewOccurred: boolean };

    const sourceIds = input.items.map((item) => faqSourceInterviewId(item, input.interviewId));
    const interviewIds = [...new Set(sourceIds.filter((id): id is string => id !== null))];
    const sourceInterviews = interviewIds.length
      ? await transaction.select({
          id: interviews.id,
          jobTrackId: interviews.jobTrackId,
          status: interviews.status,
          occurredAt: interviews.occurredAt,
        }).from(interviews)
          .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
          .where(and(inArray(interviews.id, interviewIds), eq(jobTracks.userId, input.userId))).orderBy(asc(interviews.id)).for("update", { of: interviews })
      : [];
    if (sourceInterviews.length !== interviewIds.length) throw new Error("NOT_FOUND: interview was not found");
    if (sourceInterviews.some((interview) => interview.status === "cancelled")) throw new Error("CONFLICT: cancelled interview cannot receive FAQs");

    const experienceIds = [...new Set(items.flatMap((item) => item.experienceId ? [item.experienceId] : []))];
    if (experienceIds.length) {
      const owned = await transaction.select({ id: experiences.id }).from(experiences)
        .where(and(eq(experiences.userId, input.userId), inArray(experiences.id, experienceIds)));
      if (owned.length !== experienceIds.length) throw new Error("NOT_FOUND: one or more experiences were not found");
    }
    await assertFaqCategoriesSupported(transaction, input.userId, items);

    const newlyOccurred = sourceInterviews.filter((interview) => interview.occurredAt === null);
    const interviewOccurred = newlyOccurred.length > 0;
    for (const interview of newlyOccurred) {
      await transaction.update(interviews).set({
        occurredAt: committedAt,
        updatedAt: committedAt,
        version: sql`${interviews.version} + 1`,
      }).where(eq(interviews.id, interview.id));
      await transaction.insert(events).values({
        id: randomUUID(),
        userId: input.userId,
        jobTrackId: interview.jobTrackId,
        kind: "InterviewOccurred",
        subjectType: "interview",
        subjectId: interview.id,
        occurredAt: committedAt,
        actionId: `${input.idempotencyKey}:occurred:${interview.id}`,
        payload: { confirmedBy: "faq_batch" },
      });
    }

    const faqRows = items.map((item) => ({
      id: randomUUID(),
      userId: input.userId,
      kind: item.kind,
      question: item.question,
      answer: item.answer,
      experienceId: item.experienceId,
      category: item.category,
    }));
    await transaction.insert(faqs).values(faqRows);
    await transaction.insert(faqOccurrences).values(faqRows.map((faq, index) => ({ faqId: faq.id, sourceInterviewId: sourceIds[index] })));
    const result = { faqIds: faqRows.map((faq) => faq.id), interviewOccurred };
    await transaction.insert(actionReceipts).values({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      commandType: "commit_faq_batch",
      result,
    });
    return result;
  });
}

export async function updateFaq(input: {
  userId: string;
  faqId: string;
  item: FaqBatchItem;
}) {
  const [item] = validateFaqBatch([input.item]);
  const db = getDatabaseRuntime().db;
  await db.transaction(async (transaction) => {
    const [faq] = await transaction.select({ id: faqs.id }).from(faqs)
      .where(and(eq(faqs.id, input.faqId), eq(faqs.userId, input.userId))).limit(1);
    if (!faq) throw new Error("NOT_FOUND: FAQ was not found");
    if (item.experienceId) {
      const [experience] = await transaction.select({ id: experiences.id }).from(experiences)
        .where(and(eq(experiences.id, item.experienceId), eq(experiences.userId, input.userId))).limit(1);
      if (!experience) throw new Error("NOT_FOUND: experience was not found");
    }
    await assertFaqCategoriesSupported(transaction, input.userId, [item]);
    await transaction.update(faqs).set({
      question: item.question,
      answer: item.answer,
      kind: item.kind,
      category: item.category,
      experienceId: item.experienceId,
      updatedAt: new Date(),
    }).where(eq(faqs.id, faq.id));
  });
}

export async function deleteFaq(input: { userId: string; faqId: string }) {
  const deleted = await getDatabaseRuntime().db.delete(faqs)
    .where(and(eq(faqs.id, input.faqId), eq(faqs.userId, input.userId)))
    .returning({ id: faqs.id });
  if (!deleted.length) throw new Error("NOT_FOUND: FAQ was not found");
}

export async function createFaqCategory(input: { userId: string; name: string }) {
  const name = normalizeFaqCategoryName(input.name);
  return getDatabaseRuntime().db.transaction(async (transaction) => {
    await initializeFaqCategories(transaction, input.userId);
    const [existing] = await transaction.select({ id: faqCategories.id, deletedAt: faqCategories.deletedAt })
      .from(faqCategories)
      .where(and(
        eq(faqCategories.userId, input.userId),
        eq(faqCategories.kind, "general"),
        eq(faqCategories.name, name),
      )).limit(1);
    if (existing && !existing.deletedAt) throw new Error("CONFLICT: FAQ category already exists");
    if (existing) {
      await transaction.update(faqCategories).set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(faqCategories.id, existing.id));
      return { name };
    }

    const [last] = await transaction.select({
      sortOrder: sql<number>`coalesce(max(${faqCategories.sortOrder}), -1)::int`,
    }).from(faqCategories).where(and(eq(faqCategories.userId, input.userId), eq(faqCategories.kind, "general")));
    await transaction.insert(faqCategories).values({
      id: randomUUID(),
      userId: input.userId,
      kind: "general",
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    });
    return { name };
  });
}

export async function renameFaqCategory(input: { userId: string; currentName: string; nextName: string }) {
  const currentName = normalizeFaqCategoryName(input.currentName);
  const nextName = normalizeFaqCategoryName(input.nextName);
  return getDatabaseRuntime().db.transaction(async (transaction) => {
    await initializeFaqCategories(transaction, input.userId);
    const [category] = await transaction.select({ id: faqCategories.id })
      .from(faqCategories)
      .where(and(
        eq(faqCategories.userId, input.userId),
        eq(faqCategories.kind, "general"),
        eq(faqCategories.name, currentName),
        sql`${faqCategories.deletedAt} IS NULL`,
      )).limit(1);
    if (!category) throw new Error("NOT_FOUND: FAQ category was not found");
    if (currentName === nextName) return { name: nextName };

    const [collision] = await transaction.select({ id: faqCategories.id, deletedAt: faqCategories.deletedAt })
      .from(faqCategories)
      .where(and(
        eq(faqCategories.userId, input.userId),
        eq(faqCategories.kind, "general"),
        eq(faqCategories.name, nextName),
      )).limit(1);
    if (collision && !collision.deletedAt) throw new Error("CONFLICT: FAQ category already exists");
    if (collision) await transaction.delete(faqCategories).where(eq(faqCategories.id, collision.id));

    await transaction.update(faqCategories).set({ name: nextName, updatedAt: new Date() })
      .where(eq(faqCategories.id, category.id));
    await transaction.update(faqs).set({ category: nextName, updatedAt: new Date() })
      .where(and(eq(faqs.userId, input.userId), eq(faqs.kind, "general"), eq(faqs.category, currentName)));
    return { name: nextName };
  });
}

export async function deleteFaqCategory(input: { userId: string; name: string }) {
  const name = normalizeFaqCategoryName(input.name);
  return getDatabaseRuntime().db.transaction(async (transaction) => {
    await initializeFaqCategories(transaction, input.userId);
    const [category] = await transaction.select({ id: faqCategories.id })
      .from(faqCategories)
      .where(and(
        eq(faqCategories.userId, input.userId),
        eq(faqCategories.kind, "general"),
        eq(faqCategories.name, name),
        sql`${faqCategories.deletedAt} IS NULL`,
      )).limit(1);
    if (!category) throw new Error("NOT_FOUND: FAQ category was not found");

    const resetFaqs = await transaction.update(faqs).set({ category: null, updatedAt: new Date() })
      .where(and(eq(faqs.userId, input.userId), eq(faqs.kind, "general"), eq(faqs.category, name)))
      .returning({ id: faqs.id });
    await transaction.update(faqCategories).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(faqCategories.id, category.id));
    return { resetFaqCount: resetFaqs.length };
  });
}

async function initializeFaqCategories(transaction: AppTransaction, userId: string) {
  const [existing] = await transaction.select({ id: faqCategories.id }).from(faqCategories)
    .where(and(eq(faqCategories.userId, userId), eq(faqCategories.kind, "general"))).limit(1);
  if (existing) return;
  const rows = defaultFaqCategories.map((name, sortOrder) => ({ id: randomUUID(), userId, kind: "general" as const, name, sortOrder }));
  await transaction.insert(faqCategories).values(rows).onConflictDoNothing({
    target: [faqCategories.userId, faqCategories.kind, faqCategories.name],
  });
}

export async function assertFaqCategoriesSupported(transaction: AppTransaction, userId: string, items: ValidatedFaqBatchItem[]) {
  const requested = items.flatMap((item) => item.category ? [item.category] : []);
  if (!requested.length) return;
  const rows = await transaction.select({ name: faqCategories.name, deletedAt: faqCategories.deletedAt })
    .from(faqCategories).where(and(eq(faqCategories.userId, userId), eq(faqCategories.kind, "general")));
  const supported = rows.length
    ? rows.filter((row) => !row.deletedAt).map((row) => row.name)
    : [...defaultFaqCategories];
  if (requested.some((category) => !supported.includes(category))) {
    throw new Error("VALIDATION_ERROR: FAQ category is not supported");
  }
}

function normalizeFaqCategoryName(value: string) {
  const name = value.trim();
  if (!name || name.length > 64 || name === "暂不设置") {
    throw new Error("VALIDATION_ERROR: FAQ category name is invalid");
  }
  return name;
}

function parseTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("VALIDATION_ERROR: committedAt must be an ISO timestamp");
  return timestamp;
}
