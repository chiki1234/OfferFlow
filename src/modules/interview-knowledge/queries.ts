import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { assets, experiences, faqCategories, faqOccurrences, faqs, interviews, jobDescriptions, jobTracks, resumeExperiences, resumes, tasks } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { defaultFaqCategories, type FaqCategoryConfig } from "./faq-batch";
import { normalizeFaqLibraryFilters } from "./faq-filters";
import { withFaqFacts } from "./faq-facts";

export async function getKnowledgeLibrary(userId: string, input: { query?: string; binding?: string; experienceId?: string; category?: string; settings?: string } = {}) {
  const db = getDatabaseRuntime().db;
  const [categoryConfig, experienceOptions] = await Promise.all([
    getFaqCategoryConfig(userId),
    getExperienceOptions(userId),
  ]);
  const filters = normalizeFaqLibraryFilters(input, categoryConfig, experienceOptions.map((experience) => experience.id));
  const faqConditions = [eq(faqs.userId, userId)];
  if (filters.query) {
    const escapedQuery = filters.query.replace(/[\\%_]/g, "\\$&");
    const searchCondition = or(ilike(faqs.question, `%${escapedQuery}%`), ilike(faqs.answer, `%${escapedQuery}%`));
    if (searchCondition) faqConditions.push(searchCondition);
  }
  if (filters.binding === "bound") faqConditions.push(isNotNull(faqs.experienceId));
  if (filters.binding === "unbound") faqConditions.push(isNull(faqs.experienceId));
  if (filters.experienceId) faqConditions.push(eq(faqs.experienceId, filters.experienceId));
  if (filters.category) faqConditions.push(eq(faqs.category, filters.category));
  if (filters.settings === "complete") {
    const completeCondition = or(isNotNull(faqs.experienceId), isNotNull(faqs.category));
    if (completeCondition) faqConditions.push(completeCondition);
  }
  if (filters.settings === "incomplete") {
    const incompleteCondition = and(isNull(faqs.experienceId), isNull(faqs.category));
    if (incompleteCondition) faqConditions.push(incompleteCondition);
  }

  const [experienceRows, faqRows, interviewRows, resumeRows, linkRows, faqCountRows] = await Promise.all([
    db.select({
      id: experiences.id,
      name: experiences.name,
      content: experiences.content,
      faqCount: sql<number>`count(${faqs.id})::int`,
    }).from(experiences)
      .leftJoin(faqs, and(eq(faqs.experienceId, experiences.id), eq(faqs.userId, userId)))
      .where(eq(experiences.userId, userId))
      .groupBy(experiences.id)
      .orderBy(desc(experiences.updatedAt)),
    db.select({
      id: faqs.id,
      kind: faqs.kind,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
      experienceId: faqs.experienceId,
      experienceName: experiences.name,
      createdAt: faqs.createdAt,
    }).from(faqs)
      .leftJoin(experiences, and(eq(experiences.id, faqs.experienceId), eq(experiences.userId, userId)))
      .where(and(...faqConditions))
      .orderBy(desc(faqs.createdAt)),
    db.select({
      id: interviews.id,
      roundLabel: interviews.roundLabel,
      startAt: interviews.startAt,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
    }).from(interviews)
      .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
      .where(and(eq(jobTracks.userId, userId), eq(interviews.status, "scheduled")))
      .orderBy(desc(interviews.startAt)),
    db.select({ id: resumes.id, name: resumes.name }).from(resumes)
      .where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)),
    db.select({ resumeId: resumeExperiences.resumeId, experienceId: resumeExperiences.experienceId })
      .from(resumeExperiences)
      .innerJoin(resumes, eq(resumes.id, resumeExperiences.resumeId))
      .where(eq(resumes.userId, userId))
      .orderBy(asc(resumeExperiences.sortOrder)),
    db.select({ count: sql<number>`count(*)::int` }).from(faqs).where(eq(faqs.userId, userId)),
  ]);
  return {
    filters,
    faqCategories: categoryConfig,
    totalFaqCount: faqCountRows[0]?.count ?? 0,
    experiences: experienceRows,
    faqs: await withFaqFacts(userId, faqRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))),
    interviews: interviewRows.map((row) => ({ ...row, startAt: row.startAt.toISOString() })),
    resumes: resumeRows.map((resume) => ({
      ...resume,
      experienceIds: linkRows.filter((link) => link.resumeId === resume.id).map((link) => link.experienceId),
    })),
  };
}

export async function getExperienceOptions(userId: string) {
  return getDatabaseRuntime().db.select({ id: experiences.id, name: experiences.name })
    .from(experiences)
    .where(eq(experiences.userId, userId))
    .orderBy(desc(experiences.updatedAt));
}

export async function getFaqCategoryConfig(userId: string): Promise<FaqCategoryConfig> {
  const rows = await getDatabaseRuntime().db.select({
    kind: faqCategories.kind,
    name: faqCategories.name,
    deletedAt: faqCategories.deletedAt,
  }).from(faqCategories)
    .where(and(eq(faqCategories.userId, userId), eq(faqCategories.kind, "general")))
    .orderBy(asc(faqCategories.sortOrder), asc(faqCategories.createdAt));

  if (!rows.length) {
    return [...defaultFaqCategories];
  }

  return rows.filter((row) => !row.deletedAt).map((row) => row.name);
}

export async function getExperienceDetail(userId: string, experienceId: string) {
  const db = getDatabaseRuntime().db;
  const [experience] = await db.select({
    id: experiences.id,
    name: experiences.name,
    content: experiences.content,
  }).from(experiences)
    .where(and(eq(experiences.userId, userId), eq(experiences.id, experienceId))).limit(1);
  if (!experience) throw new Error("NOT_FOUND: experience was not found");
  const [faqRows, resumeRows, categoryConfig] = await Promise.all([
    db.select({
      id: faqs.id,
      kind: faqs.kind,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
      experienceId: faqs.experienceId,
    }).from(faqs)
      .where(and(eq(faqs.userId, userId), eq(faqs.experienceId, experience.id)))
      .orderBy(desc(faqs.createdAt)),
    db.select({ id: resumes.id, name: resumes.name }).from(resumeExperiences)
      .innerJoin(resumes, eq(resumes.id, resumeExperiences.resumeId))
      .where(and(eq(resumes.userId, userId), eq(resumeExperiences.experienceId, experience.id)))
      .orderBy(desc(resumes.createdAt)),
    getFaqCategoryConfig(userId),
  ]);
  return { experience, faqs: await withFaqFacts(userId, faqRows), resumes: resumeRows, faqCategories: categoryConfig };
}

export async function getInterviewKnowledgeDetail(userId: string, interviewId: string) {
  const db = getDatabaseRuntime().db;
  const [interview] = await db.select({
    id: interviews.id,
    roundLabel: interviews.roundLabel,
    interviewType: interviews.interviewType,
    startAt: interviews.startAt,
    endAt: interviews.endAt,
    meetingUrl: interviews.meetingUrl,
    notes: interviews.notes,
    status: interviews.status,
    occurredAt: interviews.occurredAt,
    reviewedAt: interviews.reviewedAt,
    transcriptText: interviews.transcriptText,
    transcriptAssetId: interviews.transcriptAssetId,
    transcriptAssetName: assets.originalName,
    transcriptAssetMimeType: assets.mimeType,
    jobTrackId: jobTracks.id,
    companyName: jobTracks.companyName,
    roleName: jobTracks.roleName,
    resumeId: jobTracks.resumeId,
    jobDescription: jobDescriptions.textContent,
    resumeName: resumes.name,
    resumeAssetId: resumes.assetId,
  }).from(interviews)
    .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
    .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
    .leftJoin(resumes, and(eq(resumes.id, jobTracks.resumeId), eq(resumes.userId, userId)))
    .leftJoin(assets, and(eq(assets.id, interviews.transcriptAssetId), eq(assets.userId, userId)))
    .where(and(eq(interviews.id, interviewId), eq(jobTracks.userId, userId))).limit(1);
  if (!interview) throw new Error("NOT_FOUND: interview was not found");
  const [faqRows, experienceRows, taskRows, categoryConfig] = await Promise.all([
    db.select({
      id: faqs.id,
      kind: faqs.kind,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
      experienceId: faqs.experienceId,
      experienceName: experiences.name,
    }).from(faqs)
      .leftJoin(experiences, and(eq(experiences.id, faqs.experienceId), eq(experiences.userId, userId)))
      .where(and(eq(faqs.userId, userId), sql`EXISTS (SELECT 1 FROM ${faqOccurrences} WHERE ${faqOccurrences.faqId} = ${faqs.id} AND ${faqOccurrences.sourceInterviewId} = ${interview.id})`))
      .orderBy(desc(faqs.createdAt)),
    interview.resumeId
      ? db.select({ id: experiences.id, name: experiences.name, content: experiences.content })
          .from(resumeExperiences)
          .innerJoin(experiences, eq(experiences.id, resumeExperiences.experienceId))
          .where(and(eq(resumeExperiences.resumeId, interview.resumeId), eq(experiences.userId, userId)))
          .orderBy(asc(resumeExperiences.sortOrder))
      : db.select({ id: experiences.id, name: experiences.name, content: experiences.content })
          .from(experiences).where(eq(experiences.userId, userId)).orderBy(desc(experiences.updatedAt)),
    db.select({
      id: tasks.id,
      title: tasks.title,
      deadlineAt: tasks.deadlineAt,
      completedAt: tasks.completedAt,
      cancelledAt: tasks.cancelledAt,
    }).from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.interviewId, interview.id)))
      .orderBy(asc(tasks.completedAt), asc(tasks.cancelledAt), asc(tasks.deadlineAt)),
    getFaqCategoryConfig(userId),
  ]);
  return {
    interview: {
      ...interview,
      startAt: interview.startAt.toISOString(),
      endAt: interview.endAt.toISOString(),
      occurredAt: interview.occurredAt?.toISOString() ?? null,
      reviewedAt: interview.reviewedAt?.toISOString() ?? null,
    },
    faqs: await withFaqFacts(userId, faqRows),
    faqCategories: categoryConfig,
    experiences: experienceRows,
    tasks: taskRows.map((task) => ({
      ...task,
      deadlineAt: task.deadlineAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      cancelledAt: task.cancelledAt?.toISOString() ?? null,
    })),
  };
}
