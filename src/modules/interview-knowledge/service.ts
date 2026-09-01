import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  actionReceipts,
  events,
  experiences,
  faqs,
  interviews,
  jobTracks,
  resumeExperiences,
  resumes,
} from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { validateFaqBatch, type FaqBatchItem } from "./faq-batch";

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
  interviewId: string;
  items: FaqBatchItem[];
  committedAt: string;
}) {
  const items = validateFaqBatch(input.items);
  const committedAt = parseTimestamp(input.committedAt);
  return getDatabaseRuntime().db.transaction(async (transaction) => {
    const [receipt] = await transaction.select({ result: actionReceipts.result }).from(actionReceipts)
      .where(and(eq(actionReceipts.userId, input.userId), eq(actionReceipts.idempotencyKey, input.idempotencyKey))).limit(1);
    if (receipt) return receipt.result as { faqIds: string[]; interviewOccurred: boolean };

    const [interview] = await transaction.select({
      id: interviews.id,
      jobTrackId: interviews.jobTrackId,
      status: interviews.status,
      occurredAt: interviews.occurredAt,
    }).from(interviews)
      .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
      .where(and(eq(interviews.id, input.interviewId), eq(jobTracks.userId, input.userId))).limit(1);
    if (!interview) throw new Error("NOT_FOUND: interview was not found");
    if (interview.status === "cancelled") throw new Error("CONFLICT: cancelled interview cannot receive FAQs");

    const experienceIds = [...new Set(items.flatMap((item) => item.experienceId ? [item.experienceId] : []))];
    if (experienceIds.length) {
      const owned = await transaction.select({ id: experiences.id }).from(experiences)
        .where(and(eq(experiences.userId, input.userId), inArray(experiences.id, experienceIds)));
      if (owned.length !== experienceIds.length) throw new Error("NOT_FOUND: one or more experiences were not found");
    }

    const interviewOccurred = interview.occurredAt === null;
    if (interviewOccurred) {
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
        actionId: `${input.idempotencyKey}:occurred`,
        payload: { confirmedBy: "faq_batch" },
      });
    }

    const faqRows = items.map((item) => ({
      id: randomUUID(),
      userId: input.userId,
      sourceInterviewId: interview.id,
      kind: item.kind,
      question: item.question,
      answer: item.answer,
      experienceId: item.experienceId,
      category: item.category,
    }));
    await transaction.insert(faqs).values(faqRows);
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

function parseTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("VALIDATION_ERROR: committedAt must be an ISO timestamp");
  return timestamp;
}
