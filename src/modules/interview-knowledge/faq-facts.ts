import { and, eq, inArray } from "drizzle-orm";
import { getDatabaseRuntime } from "@/db/runtime";
import { faqOccurrences, faqs, interviews, jobTracks } from "@/db/schema";

export async function withFaqFacts<T extends { id: string }>(userId: string, rows: T[]) {
  const occurrences = rows.length ? await getDatabaseRuntime().db.select({
    faqId: faqOccurrences.faqId, interviewId: interviews.id, companyName: jobTracks.companyName,
    roleName: jobTracks.roleName, roundLabel: interviews.roundLabel,
  }).from(faqOccurrences).innerJoin(faqs, eq(faqs.id, faqOccurrences.faqId))
    .leftJoin(interviews, eq(interviews.id, faqOccurrences.sourceInterviewId))
    .leftJoin(jobTracks, and(eq(jobTracks.id, interviews.jobTrackId), eq(jobTracks.userId, userId)))
    .where(and(eq(faqs.userId, userId), inArray(faqs.id, rows.map((row) => row.id)))) : [];
  return rows.map((row) => {
    const appearances = occurrences.filter((item) => item.faqId === row.id);
    const sources = new Map<string, { id: string; label: string }>();
    for (const item of appearances) {
      if (item.interviewId && item.companyName) sources.set(item.interviewId, { id: item.interviewId, label: `${item.companyName} · ${item.roleName} · ${item.roundLabel}` });
    }
    return { ...row, frequency: appearances.length, sources: [...sources.values()] };
  });
}
