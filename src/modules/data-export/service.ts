import { and, eq } from "drizzle-orm";
import {
  assetLinks,
  assets,
  assessments,
  events,
  experienceGroups,
  experiences,
  faqCategories,
  faqOccurrences,
  faqs,
  interviews,
  jobDescriptions,
  jobTracks,
  resumeExperiences,
  resumes,
  tasks,
  users,
} from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";

export async function exportUserData(userId: string) {
  const db = getDatabaseRuntime().db;
  const [profileRows, jobTrackRows, descriptionRows, resumeRows, experienceGroupRows, experienceRows, resumeExperienceRows, assessmentRows, interviewRows, taskRows, eventRows, faqRows, faqCategoryRows, assetRows, assetLinkRows, occurrenceRows] = await Promise.all([
    db.select({ id: users.id, email: users.email, timezone: users.timezone, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    db.select().from(jobTracks).where(eq(jobTracks.userId, userId)),
    db.select({ id: jobDescriptions.id, jobTrackId: jobDescriptions.jobTrackId, textContent: jobDescriptions.textContent, createdAt: jobDescriptions.createdAt, updatedAt: jobDescriptions.updatedAt })
      .from(jobDescriptions).innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId)).where(eq(jobTracks.userId, userId)),
    db.select().from(resumes).where(eq(resumes.userId, userId)),
    db.select().from(experienceGroups).where(eq(experienceGroups.userId, userId)),
    db.select().from(experiences).where(eq(experiences.userId, userId)),
    db.select({ resumeId: resumeExperiences.resumeId, experienceId: resumeExperiences.experienceId, sortOrder: resumeExperiences.sortOrder })
      .from(resumeExperiences).innerJoin(resumes, eq(resumes.id, resumeExperiences.resumeId)).where(eq(resumes.userId, userId)),
    db.select({ assessment: assessments })
      .from(assessments).innerJoin(jobTracks, eq(jobTracks.id, assessments.jobTrackId)).where(eq(jobTracks.userId, userId)).then((rows) => rows.map((row) => row.assessment)),
    db.select({ interview: interviews })
      .from(interviews).innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId)).where(eq(jobTracks.userId, userId)).then((rows) => rows.map((row) => row.interview)),
    db.select().from(tasks).where(eq(tasks.userId, userId)),
    db.select().from(events).where(eq(events.userId, userId)),
    db.select().from(faqs).where(eq(faqs.userId, userId)),
    db.select().from(faqCategories).where(eq(faqCategories.userId, userId)),
    db.select({ id: assets.id, kind: assets.kind, originalName: assets.originalName, mimeType: assets.mimeType, sizeBytes: assets.sizeBytes, sha256: assets.sha256, createdAt: assets.createdAt })
      .from(assets).where(eq(assets.userId, userId)),
    db.select({ id: assetLinks.id, assetId: assetLinks.assetId, ownerType: assetLinks.ownerType, ownerId: assetLinks.ownerId, sortOrder: assetLinks.sortOrder, createdAt: assetLinks.createdAt })
      .from(assetLinks).innerJoin(assets, eq(assets.id, assetLinks.assetId)).where(and(eq(assets.userId, userId))),
    db.select({ occurrence: faqOccurrences }).from(faqOccurrences).innerJoin(faqs, eq(faqs.id, faqOccurrences.faqId)).where(eq(faqs.userId, userId)).then((rows) => rows.map((row) => row.occurrence)),
  ]);
  const profile = profileRows[0];
  if (!profile) throw new Error("NOT_FOUND: user was not found");

  return {
    format: "job-hunting-web-export",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    profile,
    data: {
      jobTracks: jobTrackRows,
      jobDescriptions: descriptionRows,
      resumes: resumeRows,
      experienceGroups: experienceGroupRows,
      experiences: experienceRows,
      resumeExperiences: resumeExperienceRows,
      assessments: assessmentRows,
      interviews: interviewRows,
      tasks: taskRows,
      events: eventRows,
      faqs: faqRows,
      faqOccurrences: occurrenceRows,
      faqCategories: faqCategoryRows,
      assets: assetRows.map((asset) => ({ ...asset, downloadPath: `/api/assets/${asset.id}` })),
      assetLinks: assetLinkRows,
    },
  };
}
