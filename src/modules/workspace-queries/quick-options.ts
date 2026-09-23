import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { interviews, jobTracks, tasks } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";

export async function getQuickActionOptions(userId: string) {
  const db = getDatabaseRuntime().db;
  const [jobs, interviewRows, unboundTaskRows] = await Promise.all([
    db.select({ id: jobTracks.id, companyName: jobTracks.companyName, department: jobTracks.department, roleName: jobTracks.roleName, createdAt: jobTracks.createdAt })
      .from(jobTracks).where(and(eq(jobTracks.userId, userId), eq(jobTracks.lifecycle, "active")))
      .orderBy(asc(jobTracks.companyName), asc(jobTracks.roleName)),
    db.select({ id: interviews.id, jobTrackId: interviews.jobTrackId, roundLabel: interviews.roundLabel, interviewType: interviews.interviewType, companyName: jobTracks.companyName, department: jobTracks.department, roleName: jobTracks.roleName })
      .from(interviews)
      .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
      .where(and(eq(jobTracks.userId, userId), eq(jobTracks.lifecycle, "active"), eq(interviews.status, "scheduled")))
      .orderBy(asc(sql`coalesce(${interviews.startAt}, ${interviews.deadlineAt})`)),
    db.select({ id: tasks.id, title: tasks.title, startAt: tasks.startAt, endAt: tasks.endAt, deadlineAt: tasks.deadlineAt })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.jobTrackId), isNull(tasks.completedAt), isNull(tasks.cancelledAt)))
      .orderBy(asc(tasks.deadlineAt)),
  ]);
  return { jobs: jobs.map((job) => ({ ...job, createdAt: job.createdAt.toISOString() })), interviews: interviewRows, unboundTasks: unboundTaskRows.map((task) => ({ ...task, startAt: task.startAt?.toISOString() ?? null, endAt: task.endAt?.toISOString() ?? null, deadlineAt: task.deadlineAt?.toISOString() ?? null })) };
}
