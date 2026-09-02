import { and, asc, eq, isNull } from "drizzle-orm";
import { interviews, jobTracks, tasks } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";

export async function getQuickActionOptions(userId: string) {
  const db = getDatabaseRuntime().db;
  const [jobs, interviewRows, unboundTaskRows] = await Promise.all([
    db.select({ id: jobTracks.id, companyName: jobTracks.companyName, roleName: jobTracks.roleName })
      .from(jobTracks).where(and(eq(jobTracks.userId, userId), eq(jobTracks.lifecycle, "active")))
      .orderBy(asc(jobTracks.companyName), asc(jobTracks.roleName)),
    db.select({ id: interviews.id, jobTrackId: interviews.jobTrackId, roundLabel: interviews.roundLabel, interviewType: interviews.interviewType, companyName: jobTracks.companyName, roleName: jobTracks.roleName })
      .from(interviews)
      .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
      .where(and(eq(jobTracks.userId, userId), eq(jobTracks.lifecycle, "active"), eq(interviews.status, "scheduled")))
      .orderBy(asc(interviews.startAt)),
    db.select({ id: tasks.id, title: tasks.title, deadlineAt: tasks.deadlineAt })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.jobTrackId), isNull(tasks.completedAt), isNull(tasks.cancelledAt)))
      .orderBy(asc(tasks.deadlineAt)),
  ]);
  return { jobs, interviews: interviewRows, unboundTasks: unboundTaskRows.map((task) => ({ ...task, deadlineAt: task.deadlineAt?.toISOString() ?? null })) };
}
