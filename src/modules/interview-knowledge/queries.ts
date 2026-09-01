import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { assets, experiences, faqs, interviews, jobTracks, resumeExperiences, resumes } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { normalizeFaqLibraryFilters } from "./faq-filters";

export async function getKnowledgeLibrary(userId: string, input: { query?: string; kind?: string; category?: string } = {}) {
  const db = getDatabaseRuntime().db;
  const filters = normalizeFaqLibraryFilters(input);
  const faqConditions = [eq(faqs.userId, userId)];
  if (filters.query) {
    const escapedQuery = filters.query.replace(/[\\%_]/g, "\\$&");
    const searchCondition = or(ilike(faqs.question, `%${escapedQuery}%`), ilike(faqs.answer, `%${escapedQuery}%`));
    if (searchCondition) faqConditions.push(searchCondition);
  }
  if (filters.kind) faqConditions.push(eq(faqs.kind, filters.kind));
  if (filters.category) faqConditions.push(eq(faqs.category, filters.category));

  const [experienceRows, faqRows, interviewRows, resumeRows, linkRows, faqCountRows] = await Promise.all([
    db.select({
      id: experiences.id,
      name: experiences.name,
      content: experiences.content,
      faqCount: sql<number>`count(${faqs.id})::int`,
    }).from(experiences)
      .leftJoin(faqs, eq(faqs.experienceId, experiences.id))
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
      sourceInterviewId: faqs.sourceInterviewId,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
      roundLabel: interviews.roundLabel,
      createdAt: faqs.createdAt,
    }).from(faqs)
      .leftJoin(experiences, eq(experiences.id, faqs.experienceId))
      .innerJoin(interviews, eq(interviews.id, faqs.sourceInterviewId))
      .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
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
    totalFaqCount: faqCountRows[0]?.count ?? 0,
    experiences: experienceRows,
    faqs: faqRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    interviews: interviewRows.map((row) => ({ ...row, startAt: row.startAt.toISOString() })),
    resumes: resumeRows.map((resume) => ({
      ...resume,
      experienceIds: linkRows.filter((link) => link.resumeId === resume.id).map((link) => link.experienceId),
    })),
  };
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
  const [faqRows, resumeRows] = await Promise.all([
    db.select({
      id: faqs.id,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
      roundLabel: interviews.roundLabel,
      sourceInterviewId: interviews.id,
    }).from(faqs)
      .innerJoin(interviews, eq(interviews.id, faqs.sourceInterviewId))
      .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
      .where(and(eq(faqs.userId, userId), eq(faqs.experienceId, experience.id)))
      .orderBy(desc(faqs.createdAt)),
    db.select({ id: resumes.id, name: resumes.name }).from(resumeExperiences)
      .innerJoin(resumes, eq(resumes.id, resumeExperiences.resumeId))
      .where(and(eq(resumes.userId, userId), eq(resumeExperiences.experienceId, experience.id)))
      .orderBy(desc(resumes.createdAt)),
  ]);
  return { experience, faqs: faqRows, resumes: resumeRows };
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
  }).from(interviews)
    .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
    .leftJoin(assets, eq(assets.id, interviews.transcriptAssetId))
    .where(and(eq(interviews.id, interviewId), eq(jobTracks.userId, userId))).limit(1);
  if (!interview) throw new Error("NOT_FOUND: interview was not found");
  const [faqRows, experienceRows] = await Promise.all([
    db.select({
      id: faqs.id,
      question: faqs.question,
      answer: faqs.answer,
      category: faqs.category,
      experienceId: faqs.experienceId,
      experienceName: experiences.name,
    }).from(faqs)
      .leftJoin(experiences, eq(experiences.id, faqs.experienceId))
      .where(and(eq(faqs.userId, userId), eq(faqs.sourceInterviewId, interview.id)))
      .orderBy(desc(faqs.createdAt)),
    interview.resumeId
      ? db.select({ id: experiences.id, name: experiences.name, content: experiences.content })
          .from(resumeExperiences)
          .innerJoin(experiences, eq(experiences.id, resumeExperiences.experienceId))
          .where(and(eq(resumeExperiences.resumeId, interview.resumeId), eq(experiences.userId, userId)))
          .orderBy(asc(resumeExperiences.sortOrder))
      : db.select({ id: experiences.id, name: experiences.name, content: experiences.content })
          .from(experiences).where(eq(experiences.userId, userId)).orderBy(desc(experiences.updatedAt)),
  ]);
  return {
    interview: {
      ...interview,
      startAt: interview.startAt.toISOString(),
      endAt: interview.endAt.toISOString(),
      occurredAt: interview.occurredAt?.toISOString() ?? null,
      reviewedAt: interview.reviewedAt?.toISOString() ?? null,
    },
    faqs: faqRows,
    experiences: experienceRows,
  };
}
