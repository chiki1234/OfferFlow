import { and, desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { events, jobDescriptions, jobTracks } from "@/db/schema";
import type {
  JobTrackListItem,
  WorkspaceQueries,
  WorkspaceView,
} from "./interface";

export function createPostgresWorkspaceQueries(db: AppDatabase): WorkspaceQueries {
  return {
    async read(query, context): Promise<WorkspaceView> {
      const conditions = [eq(jobTracks.userId, context.userId)];
      if (query.lifecycle) {
        conditions.push(eq(jobTracks.lifecycle, query.lifecycle));
      }

      const rows = await db
        .select({
          id: jobTracks.id,
          companyName: jobTracks.companyName,
          roleName: jobTracks.roleName,
          lifecycle: jobTracks.lifecycle,
          submittedAt: jobTracks.submittedAt,
          resumeId: jobTracks.resumeId,
          descriptionText: jobDescriptions.textContent,
          lastProgressAt: sql<Date | null>`max(${events.occurredAt})`,
        })
        .from(jobTracks)
        .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
        .leftJoin(events, eq(events.jobTrackId, jobTracks.id))
        .where(and(...conditions))
        .groupBy(jobTracks.id, jobDescriptions.textContent)
        .orderBy(desc(jobTracks.updatedAt));

      const countsRows = await db
        .select({ lifecycle: jobTracks.lifecycle, count: sql<number>`count(*)::int` })
        .from(jobTracks)
        .where(eq(jobTracks.userId, context.userId))
        .groupBy(jobTracks.lifecycle);
      const counts = { planned: 0, active: 0, ended: 0 };
      for (const row of countsRows) {
        counts[row.lifecycle] = row.count;
      }

      const items: JobTrackListItem[] = rows.map((row) => ({
        id: row.id,
        companyName: row.companyName,
        roleName: row.roleName,
        lifecycle: row.lifecycle,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        hasJobDescription: Boolean(row.descriptionText),
        hasResume: Boolean(row.resumeId),
        lastProgressAt: row.lastProgressAt?.toISOString() ?? null,
      }));

      return { type: "job_track_list", items, counts };
    },
  };
}
