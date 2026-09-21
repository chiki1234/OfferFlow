import { asc, eq } from "drizzle-orm";
import { getDatabaseRuntime } from "@/db/runtime";
import { jobTracks } from "@/db/schema";

export type CompanyOption = { name: string; maxRank: number };
export async function getCompanyOptions(userId: string): Promise<CompanyOption[]> {
  const rows = await getDatabaseRuntime().db.select({ name: jobTracks.companyName, rank: jobTracks.preferenceRank }).from(jobTracks).where(eq(jobTracks.userId, userId)).orderBy(asc(jobTracks.companyName));
  const map = new Map<string, CompanyOption>();
  for (const row of rows) { const key = row.name.trim().toLowerCase(); const old = map.get(key); map.set(key, { name: old?.name ?? row.name.trim(), maxRank: Math.max(old?.maxRank ?? 0, row.rank ?? 0) }); }
  return [...map.values()];
}
