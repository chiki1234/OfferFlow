import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { assetLinks, assets, assessments, events, interviews, jobDescriptions, jobTracks, resumes, tasks } from "@/db/schema";
import { deriveJobTrackStatus, type JobTrackFacts } from "./derive-job-track-status";
import { deriveJobTrackCurrentNext } from "./derive-job-track-current-next";
import { markCalendarConflicts } from "./calendar-conflicts";
import { sortDashboardActionItems } from "./dashboard-priority";
import type {
  CalendarItem,
  DashboardActionItem,
  DashboardView,
  JobTrackDetailView,
  JobTrackListItem,
  JobTrackListView,
  WorkspaceQueries,
  WorkspaceQuery,
  WorkspaceView,
  WorkspaceViewFor,
} from "./interface";

type AssessmentRow = Awaited<ReturnType<ReturnType<typeof createLoaders>["assessments"]>>[number];
type InterviewRow = Awaited<ReturnType<ReturnType<typeof createLoaders>["interviews"]>>[number];
type TaskRow = Awaited<ReturnType<ReturnType<typeof createLoaders>["tasks"]>>[number];

export function createPostgresWorkspaceQueries(db: AppDatabase): WorkspaceQueries {
  const loaders = createLoaders(db);
  return {
    async read<TQuery extends WorkspaceQuery>(
      query: TQuery,
      context: { userId: string },
    ): Promise<WorkspaceViewFor<TQuery>> {
      let view: WorkspaceView;
      switch (query.type) {
        case "list_job_tracks":
          view = await readJobTracks(db, loaders, context.userId, query.lifecycle);
          break;
        case "get_dashboard":
          view = await readDashboard(db, loaders, context.userId, parseNow(query.now));
          break;
        case "get_calendar_week": {
          const startAt = parseBoundary(query.startAt, "startAt");
          const endAt = parseBoundary(query.endAt, "endAt");
          if (startAt >= endAt) {
            throw new Error("VALIDATION_ERROR: calendar endAt must be after startAt");
          }
          const [assessmentRows, interviewRows, taskRows] = await Promise.all([
            loaders.assessments(context.userId),
            loaders.interviews(context.userId),
            loaders.tasks(context.userId),
          ]);
          view = {
            type: "calendar_week",
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            items: buildCalendarItems(assessmentRows, interviewRows, taskRows, startAt, endAt),
          };
          break;
        }
        case "get_job_track_detail":
          view = await readJobTrackDetail(db, loaders, context.userId, query.jobTrackId);
          break;
      }
      return view as WorkspaceViewFor<TQuery>;
    },
  };
}

function createLoaders(db: AppDatabase) {
  return {
    assessments(userId: string) {
      return db.select({
        id: assessments.id,
        jobTrackId: assessments.jobTrackId,
        companyName: jobTracks.companyName,
        roleName: jobTracks.roleName,
        kind: assessments.kind,
        title: assessments.title,
        timingType: assessments.timingType,
        deadlineAt: assessments.deadlineAt,
        startAt: assessments.startAt,
        endAt: assessments.endAt,
        status: assessments.status,
        completedAt: assessments.completedAt,
        cancelledAt: assessments.cancelledAt,
      }).from(assessments)
        .innerJoin(jobTracks, eq(jobTracks.id, assessments.jobTrackId))
        .where(eq(jobTracks.userId, userId));
    },
    interviews(userId: string) {
      return db.select({
        id: interviews.id,
        jobTrackId: interviews.jobTrackId,
        companyName: jobTracks.companyName,
        roleName: jobTracks.roleName,
        roundLabel: interviews.roundLabel,
        interviewType: interviews.interviewType,
        sequenceNo: interviews.sequenceNo,
        startAt: interviews.startAt,
        endAt: interviews.endAt,
        status: interviews.status,
        occurredAt: interviews.occurredAt,
        reviewedAt: interviews.reviewedAt,
        meetingUrl: interviews.meetingUrl,
        notes: interviews.notes,
        cancelledAt: interviews.cancelledAt,
        transcriptText: interviews.transcriptText,
        transcriptAssetId: interviews.transcriptAssetId,
      }).from(interviews)
        .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
        .where(eq(jobTracks.userId, userId));
    },
    tasks(userId: string) {
      return db.select({
        id: tasks.id,
        jobTrackId: tasks.jobTrackId,
        interviewId: tasks.interviewId,
        assessmentId: tasks.assessmentId,
        companyName: jobTracks.companyName,
        roleName: jobTracks.roleName,
        kind: tasks.kind,
        title: tasks.title,
        deadlineAt: tasks.deadlineAt,
        completedAt: tasks.completedAt,
        cancelledAt: tasks.cancelledAt,
      }).from(tasks)
        .leftJoin(jobTracks, eq(jobTracks.id, tasks.jobTrackId))
        .where(eq(tasks.userId, userId));
    },
  };
}

async function readJobTrackDetail(
  db: AppDatabase,
  loaders: ReturnType<typeof createLoaders>,
  userId: string,
  jobTrackId: string,
): Promise<JobTrackDetailView> {
  const [job, assessmentRows, interviewRows, taskRows, eventRows, resumeRows, imageRows] = await Promise.all([
    db.select({
      id: jobTracks.id,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
      lifecycle: jobTracks.lifecycle,
      submittedAt: jobTracks.submittedAt,
      endedAt: jobTracks.endedAt,
      endReason: jobTracks.endReason,
      resumeId: jobTracks.resumeId,
      jobUrl: jobTracks.jobUrl,
      descriptionText: jobDescriptions.textContent,
      lastProgressAt: sql<Date | null>`max(${events.occurredAt})`,
      version: jobTracks.version,
    }).from(jobTracks)
      .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
      .leftJoin(events, eq(events.jobTrackId, jobTracks.id))
      .where(and(eq(jobTracks.userId, userId), eq(jobTracks.id, jobTrackId)))
      .groupBy(jobTracks.id, jobDescriptions.textContent)
      .then((rows) => rows[0] ?? null),
    loaders.assessments(userId).then((rows) => rows.filter((row) => row.jobTrackId === jobTrackId)),
    loaders.interviews(userId).then((rows) => rows.filter((row) => row.jobTrackId === jobTrackId)),
    loaders.tasks(userId).then((rows) => rows.filter((row) => row.jobTrackId === jobTrackId)),
    db.select({
      id: events.id,
      kind: events.kind,
      jobTrackId: events.jobTrackId,
      subjectType: events.subjectType,
      subjectId: events.subjectId,
      occurredAt: events.occurredAt,
      payload: events.payload,
    }).from(events)
      .where(and(eq(events.userId, userId), eq(events.jobTrackId, jobTrackId)))
      .orderBy(desc(events.occurredAt)),
    db.select({ id: resumes.id, name: resumes.name, assetId: resumes.assetId })
      .from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)),
    db.select({ id: assets.id, originalName: assets.originalName, mimeType: assets.mimeType })
      .from(assetLinks)
      .innerJoin(assets, eq(assets.id, assetLinks.assetId))
      .innerJoin(jobDescriptions, eq(jobDescriptions.id, assetLinks.ownerId))
      .innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId))
      .where(and(eq(assetLinks.ownerType, "job_description"), eq(jobTracks.id, jobTrackId), eq(jobTracks.userId, userId)))
      .orderBy(asc(assetLinks.sortOrder)),
  ]);
  if (!job) throw new Error("NOT_FOUND: job track was not found");
  const now = new Date();
  const status = deriveJobTrackStatus(buildJobTrackFacts(job, assessmentRows, interviewRows, taskRows), now);
  const currentNext = deriveJobTrackCurrentNext({
    lifecycle: job.lifecycle,
    submittedAt: job.submittedAt?.toISOString() ?? null,
    endedAt: job.endedAt?.toISOString() ?? null,
    endReason: job.endReason,
    lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
    assessments: assessmentRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      timing: row.timingType === "deadline"
        ? { type: "deadline" as const, deadlineAt: requireDate(row.deadlineAt).toISOString() }
        : { type: "fixed_slot" as const, startAt: requireDate(row.startAt).toISOString(), endAt: requireDate(row.endAt).toISOString() },
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
    interviews: interviewRows.map((row) => ({
      id: row.id,
      roundLabel: row.roundLabel,
      interviewType: row.interviewType,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    })),
    tasks: taskRows.map((row) => ({
      id: row.id,
      interviewId: row.interviewId,
      kind: row.kind,
      title: row.title,
      deadlineAt: row.deadlineAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
  }, now);
  return {
    type: "job_track_detail",
    jobTrack: {
      id: job.id,
      companyName: job.companyName,
      roleName: job.roleName,
      lifecycle: job.lifecycle,
      submittedAt: job.submittedAt?.toISOString() ?? null,
      endedAt: job.endedAt?.toISOString() ?? null,
      endReason: job.endReason,
      hasJobDescription: Boolean(job.descriptionText || imageRows.length),
      hasResume: Boolean(job.resumeId),
      lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
      actionState: status.actionState,
      attentionFlags: status.attentionFlags,
      version: job.version,
      jobUrl: job.jobUrl,
      jobDescription: job.descriptionText,
    },
    assessments: assessmentRows.map((row) => ({
      id: row.id,
      jobTrackId: row.jobTrackId,
      kind: row.kind,
      title: row.title,
      timing: row.timingType === "deadline"
        ? { type: "deadline", deadlineAt: requireDate(row.deadlineAt).toISOString() }
        : { type: "fixed_slot", startAt: requireDate(row.startAt).toISOString(), endAt: requireDate(row.endAt).toISOString() },
      status: row.status,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
    interviews: interviewRows.map((row) => ({
      id: row.id,
      jobTrackId: row.jobTrackId,
      sequenceNo: row.sequenceNo,
      roundLabel: row.roundLabel,
      interviewType: row.interviewType,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      meetingUrl: row.meetingUrl,
      notes: row.notes,
      status: row.status,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      transcriptText: row.transcriptText,
      transcriptAssetId: row.transcriptAssetId,
    })),
    tasks: taskRows.map((row) => ({
      id: row.id,
      jobTrackId: row.jobTrackId,
      interviewId: row.interviewId,
      assessmentId: row.assessmentId,
      kind: row.kind,
      title: row.title,
      deadlineAt: row.deadlineAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
    events: eventRows.map((row) => ({
      id: row.id,
      kind: row.kind as JobTrackDetailView["events"][number]["kind"],
      jobTrackId: row.jobTrackId,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
    })),
    resumes: resumeRows.map(({ id, name }) => ({ id, name })),
    selectedResume: resumeRows.find((resume) => resume.id === job.resumeId) ?? null,
    jobDescriptionImages: imageRows,
    currentNext,
  };
}

async function readJobTracks(
  db: AppDatabase,
  loaders: ReturnType<typeof createLoaders>,
  userId: string,
  lifecycle?: "planned" | "active" | "ended",
): Promise<JobTrackListView> {
  const conditions = [eq(jobTracks.userId, userId)];
  if (lifecycle) conditions.push(eq(jobTracks.lifecycle, lifecycle));
  const [rows, countsRows, assessmentRows, interviewRows, taskRows, imageJobRows] = await Promise.all([
    db.select({
      id: jobTracks.id,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
      lifecycle: jobTracks.lifecycle,
      submittedAt: jobTracks.submittedAt,
      endedAt: jobTracks.endedAt,
      endReason: jobTracks.endReason,
      resumeId: jobTracks.resumeId,
      descriptionText: jobDescriptions.textContent,
      lastProgressAt: sql<Date | null>`max(${events.occurredAt})`,
      version: jobTracks.version,
    }).from(jobTracks)
      .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
      .leftJoin(events, eq(events.jobTrackId, jobTracks.id))
      .where(and(...conditions))
      .groupBy(jobTracks.id, jobDescriptions.textContent)
      .orderBy(desc(jobTracks.updatedAt)),
    db.select({ lifecycle: jobTracks.lifecycle, count: sql<number>`count(*)::int` })
      .from(jobTracks).where(eq(jobTracks.userId, userId)).groupBy(jobTracks.lifecycle),
    loaders.assessments(userId),
    loaders.interviews(userId),
    loaders.tasks(userId),
    db.selectDistinct({ jobTrackId: jobDescriptions.jobTrackId })
      .from(assetLinks)
      .innerJoin(jobDescriptions, eq(jobDescriptions.id, assetLinks.ownerId))
      .innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId))
      .where(and(eq(assetLinks.ownerType, "job_description"), eq(jobTracks.userId, userId))),
  ]);
  const counts = { planned: 0, active: 0, ended: 0 };
  for (const row of countsRows) counts[row.lifecycle] = row.count;
  const now = new Date();
  const jobsWithDescriptionImages = new Set(imageJobRows.map((row) => row.jobTrackId));
  const items = rows.map((row) => {
    const status = deriveJobTrackStatus(buildJobTrackFacts(row, assessmentRows, interviewRows, taskRows), now);
    return {
      id: row.id,
      companyName: row.companyName,
      roleName: row.roleName,
      lifecycle: row.lifecycle,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      endReason: row.endReason,
      hasJobDescription: Boolean(row.descriptionText || jobsWithDescriptionImages.has(row.id)),
      hasResume: Boolean(row.resumeId),
      lastProgressAt: row.lastProgressAt?.toISOString() ?? null,
      actionState: status.actionState,
      attentionFlags: status.attentionFlags,
      version: row.version,
    } satisfies JobTrackListItem;
  });
  return { type: "job_track_list", items, counts };
}

async function readDashboard(
  db: AppDatabase,
  loaders: ReturnType<typeof createLoaders>,
  userId: string,
  now: Date,
): Promise<DashboardView> {
  const [jobView, assessmentRows, interviewRows, taskRows] = await Promise.all([
    readJobTracks(db, loaders, userId),
    loaders.assessments(userId),
    loaders.interviews(userId),
    loaders.tasks(userId),
  ]);
  const todayEnd = endOfTodayInShanghai(now);
  const todayItems = sortDashboardActionItems([
    ...assessmentRows.filter((row) => row.status === "pending")
      .map((row) => ({ row, dueAt: row.timingType === "deadline" ? row.deadlineAt : row.startAt }))
      .filter((item): item is { row: AssessmentRow; dueAt: Date } => Boolean(item.dueAt && item.dueAt <= todayEnd))
      .map(({ row, dueAt }) => ({
        id: row.id,
        sourceType: "assessment" as const,
        jobTrackId: row.jobTrackId,
        companyName: row.companyName,
        roleName: row.roleName,
        title: row.title,
        dueAt: dueAt.toISOString(),
        overdue: dueAt < now,
      })),
    ...taskRows.filter((row) => row.kind !== "assessment" && !row.completedAt && !row.cancelledAt && row.deadlineAt && row.deadlineAt <= todayEnd)
      .map((row) => ({
        id: row.id,
        sourceType: "task" as const,
        jobTrackId: row.jobTrackId,
        companyName: row.companyName,
        roleName: row.roleName,
        title: row.title,
        dueAt: (row.deadlineAt as Date).toISOString(),
        overdue: (row.deadlineAt as Date) < now,
      })),
    ...interviewRows.filter((row) => row.status === "scheduled" && row.startAt <= now && !row.reviewedAt)
      .map((row) => ({
        id: row.id,
        sourceType: "interview_review" as const,
        jobTrackId: row.jobTrackId,
        companyName: row.companyName,
        roleName: row.roleName,
        title: `复盘${row.roundLabel}`,
        dueAt: row.startAt.toISOString(),
        overdue: false,
      })),
  ] satisfies DashboardActionItem[]);
  const upcomingEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    type: "dashboard",
    counts: jobView.counts,
    todayItems,
    upcomingItems: buildCalendarItems(assessmentRows, interviewRows, taskRows, now, upcomingEnd),
    attentionJobs: jobView.items.filter((job) => job.attentionFlags.length > 0),
  };
}

function buildJobTrackFacts(
  job: { id: string; lifecycle: "planned" | "active" | "ended"; submittedAt: Date | null },
  assessmentRows: AssessmentRow[],
  interviewRows: InterviewRow[],
  taskRows: TaskRow[],
): JobTrackFacts {
  return {
    lifecycle: job.lifecycle,
    submittedAt: job.submittedAt?.toISOString() ?? null,
    assessments: assessmentRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      status: row.status,
      timing: row.timingType === "deadline"
        ? { type: "deadline" as const, deadlineAt: requireDate(row.deadlineAt).toISOString() }
        : { type: "fixed_slot" as const, startAt: requireDate(row.startAt).toISOString(), endAt: requireDate(row.endAt).toISOString() },
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
    interviews: interviewRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      status: row.status,
      startAt: row.startAt.toISOString(),
      occurredAt: row.occurredAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    })),
    tasks: taskRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      kind: row.kind,
      deadlineAt: row.deadlineAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      interviewId: row.interviewId,
    })),
  };
}

function buildCalendarItems(
  assessmentRows: AssessmentRow[],
  interviewRows: InterviewRow[],
  taskRows: TaskRow[],
  startAt: Date,
  endAt: Date,
): CalendarItem[] {
  const items: CalendarItem[] = [
    ...interviewRows.filter((row) => row.status === "scheduled").map((row) => ({
      id: row.id,
      sourceType: "interview" as const,
      jobTrackId: row.jobTrackId,
      companyName: row.companyName,
      roleName: row.roleName,
      title: `${row.roundLabel} · ${row.interviewType}`,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      isDeadline: false,
      hasConflict: false,
    })),
    ...assessmentRows.filter((row) => row.status === "pending").map((row) => ({
      id: row.id,
      sourceType: "assessment" as const,
      jobTrackId: row.jobTrackId,
      companyName: row.companyName,
      roleName: row.roleName,
      title: row.title,
      startAt: requireDate(row.timingType === "deadline" ? row.deadlineAt : row.startAt).toISOString(),
      endAt: row.timingType === "fixed_slot" ? requireDate(row.endAt).toISOString() : null,
      isDeadline: row.timingType === "deadline",
      hasConflict: false,
    })),
    ...taskRows.filter((row) => row.kind !== "assessment" && !row.completedAt && !row.cancelledAt && row.deadlineAt).map((row) => ({
      id: row.id,
      sourceType: "task" as const,
      jobTrackId: row.jobTrackId,
      companyName: row.companyName,
      roleName: row.roleName,
      title: row.title,
      startAt: (row.deadlineAt as Date).toISOString(),
      endAt: null,
      isDeadline: true,
      hasConflict: false,
    })),
  ].filter((item) => {
    const itemTime = new Date(item.startAt);
    return itemTime >= startAt && itemTime < endAt;
  }).sort((left, right) => left.startAt.localeCompare(right.startAt));
  return markCalendarConflicts(items);
}

function parseNow(value?: string): Date {
  return value ? parseBoundary(value, "now") : new Date();
}

function parseBoundary(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`VALIDATION_ERROR: ${field} must be an ISO timestamp`);
  return date;
}

function requireDate(value: Date | null): Date {
  if (!value) throw new Error("INTERNAL_ERROR: timing date is missing");
  return value;
}

function endOfTodayInShanghai(now: Date): Date {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000 - 1);
}
