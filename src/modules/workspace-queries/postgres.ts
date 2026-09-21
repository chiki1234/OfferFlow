import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { assetLinks, assets, assessments, events, experiences, faqs, interviews, jobDescriptions, jobTracks, resumeExperiences, resumes, tasks } from "@/db/schema";
import { deriveJobTrackStatus, jobWaitingDays, type JobTrackFacts } from "./derive-job-track-status";
import { deriveJobTrackCurrentNext, type JobTrackCurrentNextFacts } from "./derive-job-track-current-next";
import { markCalendarConflicts } from "./calendar-conflicts";
import { sortDashboardActionItems } from "./dashboard-priority";
import { interviewReviewDeadline } from "./interview-review";
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
          view = await readDashboard(db, loaders, context.userId, parseNow(query.now), query.waitingDays);
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
        department: jobTracks.department,
        preferenceRank: jobTracks.preferenceRank,
        kind: assessments.kind,
        title: assessments.title,
        assessmentUrl: assessments.assessmentUrl,
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
        department: jobTracks.department,
        preferenceRank: jobTracks.preferenceRank,
        roundLabel: interviews.roundLabel,
        interviewType: interviews.interviewType,
        sequenceNo: interviews.sequenceNo,
        timingType: interviews.timingType,
        deadlineAt: interviews.deadlineAt,
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
        department: jobTracks.department,
        preferenceRank: jobTracks.preferenceRank,
        kind: tasks.kind,
        title: tasks.title,
        deadlineAt: tasks.deadlineAt, startAt: tasks.startAt, endAt: tasks.endAt,
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
  const [job, assessmentRows, interviewRows, taskRows, eventRows, resumeRows, imageRows, selectedExperienceRows] = await Promise.all([
    db.select({
      id: jobTracks.id,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
        department: jobTracks.department,
        preferenceRank: jobTracks.preferenceRank,
      lifecycle: jobTracks.lifecycle,
      submittedAt: jobTracks.submittedAt,
      endedAt: jobTracks.endedAt,
      endReason: jobTracks.endReason,
      resumeId: jobTracks.resumeId,
      jobUrl: jobTracks.jobUrl,
      descriptionText: jobDescriptions.textContent,
      lastProgressAt: max(events.occurredAt),
      version: jobTracks.version,
    }).from(jobTracks)
      .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
      .leftJoin(events, and(eq(events.jobTrackId, jobTracks.id), eq(events.userId, userId)))
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
      .orderBy(desc(events.occurredAt), desc(events.id)),
    db.select({ id: resumes.id, name: resumes.name, assetId: resumes.assetId })
      .from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)),
    db.select({ id: assets.id, originalName: assets.originalName, mimeType: assets.mimeType })
      .from(assetLinks)
      .innerJoin(assets, eq(assets.id, assetLinks.assetId))
      .innerJoin(jobDescriptions, eq(jobDescriptions.id, assetLinks.ownerId))
      .innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId))
      .where(and(eq(assetLinks.ownerType, "job_description"), eq(jobTracks.id, jobTrackId), eq(jobTracks.userId, userId), eq(assets.userId, userId)))
      .orderBy(asc(assetLinks.sortOrder)),
    db.select({
      id: experiences.id,
      name: experiences.name,
      faqCount: sql<number>`count(${faqs.id})::int`,
    }).from(jobTracks)
      .innerJoin(resumes, eq(resumes.id, jobTracks.resumeId))
      .innerJoin(resumeExperiences, eq(resumeExperiences.resumeId, resumes.id))
      .innerJoin(experiences, eq(experiences.id, resumeExperiences.experienceId))
      .leftJoin(faqs, and(eq(faqs.experienceId, experiences.id), eq(faqs.userId, userId)))
      .where(and(
        eq(jobTracks.id, jobTrackId),
        eq(jobTracks.userId, userId),
        eq(resumes.userId, userId),
        eq(experiences.userId, userId),
      ))
      .groupBy(experiences.id, resumeExperiences.sortOrder)
      .orderBy(asc(resumeExperiences.sortOrder)),
  ]);
  if (!job) throw new Error("NOT_FOUND: job track was not found");
  const now = new Date();
  const status = deriveJobTrackStatus(buildJobTrackFacts(job, assessmentRows, interviewRows, taskRows), now);
  const currentNext = deriveJobTrackCurrentNext(buildCurrentNextFacts(job, assessmentRows, interviewRows, taskRows), now);
  return {
    type: "job_track_detail",
    jobTrack: {
      id: job.id,
      companyName: job.companyName,
      roleName: job.roleName, department: job.department,
      preferenceRank: job.preferenceRank ?? null,
      lifecycle: job.lifecycle,
      submittedAt: job.submittedAt?.toISOString() ?? null,
      endedAt: job.endedAt?.toISOString() ?? null,
      endReason: job.endReason,
      hasJobDescription: Boolean(job.descriptionText || imageRows.length),
      hasResume: Boolean(job.resumeId),
      lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
      actionState: status.actionState,
      attentionFlags: status.attentionFlags,
      currentNext,
      version: job.version,
      jobUrl: job.jobUrl,
      jobDescription: job.descriptionText,
    },
    assessments: assessmentRows.map((row) => ({
      id: row.id,
      jobTrackId: row.jobTrackId,
      kind: row.kind,
      assessmentUrl: row.assessmentUrl,
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
      timing: interviewTimingFromRow(row),
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
      deadlineAt: row.deadlineAt?.toISOString() ?? null, startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null,
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
    selectedResumeExperiences: selectedExperienceRows,
    jobDescriptionImages: imageRows,
  };
}

async function readJobTracks(
  db: AppDatabase,
  loaders: ReturnType<typeof createLoaders>,
  userId: string,
  lifecycle?: "planned" | "active" | "ended",
  now = new Date(),
  waitingThreshold = 5,
): Promise<JobTrackListView> {
  const conditions = [eq(jobTracks.userId, userId)];
  if (lifecycle) conditions.push(eq(jobTracks.lifecycle, lifecycle));
  const [rows, countsRows, assessmentRows, interviewRows, taskRows, imageJobRows, latestEvents, resumeRows] = await Promise.all([
    db.select({
      id: jobTracks.id,
      companyName: jobTracks.companyName,
      roleName: jobTracks.roleName,
        department: jobTracks.department,
        preferenceRank: jobTracks.preferenceRank,
      lifecycle: jobTracks.lifecycle,
      submittedAt: jobTracks.submittedAt,
      endedAt: jobTracks.endedAt,
      endReason: jobTracks.endReason,
      resumeId: jobTracks.resumeId,
      jobUrl: jobTracks.jobUrl,
      descriptionText: jobDescriptions.textContent,
      lastProgressAt: max(events.occurredAt),
      version: jobTracks.version,
    }).from(jobTracks)
      .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
      .leftJoin(events, and(eq(events.jobTrackId, jobTracks.id), eq(events.userId, userId)))
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
      .innerJoin(assets, eq(assets.id, assetLinks.assetId))
      .innerJoin(jobDescriptions, eq(jobDescriptions.id, assetLinks.ownerId))
      .innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId))
      .where(and(eq(assetLinks.ownerType, "job_description"), eq(jobTracks.userId, userId), eq(assets.userId, userId))),
    db.selectDistinctOn([events.jobTrackId], { jobTrackId: events.jobTrackId, kind: events.kind, payload: events.payload, occurredAt: events.occurredAt }).from(events).where(eq(events.userId, userId)).orderBy(events.jobTrackId, desc(events.occurredAt), desc(events.id)),
    db.select({ id: resumes.id, name: resumes.name, assetId: resumes.assetId }).from(resumes).where(eq(resumes.userId, userId)),
  ]);
  const counts = { planned: 0, active: 0, ended: 0 };
  for (const row of countsRows) counts[row.lifecycle] = row.count;
  const latestByJob = new Map(latestEvents.map(event => [event.jobTrackId, event]));
  const jobsWithDescriptionImages = new Set(imageJobRows.map((row) => row.jobTrackId));
  const items = rows.map((row) => {
    const status = deriveJobTrackStatus(buildJobTrackFacts(row, assessmentRows, interviewRows, taskRows), now, waitingThreshold);
    const currentNext = deriveJobTrackCurrentNext(buildCurrentNextFacts(row, assessmentRows, interviewRows, taskRows), now);
    return {
      id: row.id,
      companyName: row.companyName,
      roleName: row.roleName, department: row.department,
      preferenceRank: row.preferenceRank ?? null,
      lifecycle: row.lifecycle,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      endReason: row.endReason,
      hasJobDescription: Boolean(row.descriptionText || jobsWithDescriptionImages.has(row.id)),
      jobUrl: row.jobUrl,
      selectedResume: resumeRows.find(resume => resume.id === row.resumeId) ?? null,
      milestones: [
        ...assessmentRows.filter(item => item.jobTrackId === row.id).map(item => ({ id: item.id, title: item.title, href: '/jobs/' + row.id + '#assessment-' + item.id, status: ({ pending: '待完成', completed: '已完成', cancelled: '已取消' })[item.status], at: (item.startAt ?? item.deadlineAt)?.toISOString() ?? null, endAt: item.endAt?.toISOString() ?? null, timingType: item.startAt ? 'fixed_slot' as const : 'deadline' as const })),
        ...interviewRows.filter(item => item.jobTrackId === row.id).map(item => ({ id: item.id, title: item.roundLabel, href: '/interviews/' + item.id, status: item.status === 'cancelled' ? '已取消' : item.reviewedAt ? '已复盘' : item.occurredAt ? '已面试' : '已安排', at: (item.startAt ?? item.deadlineAt)?.toISOString() ?? null, endAt: item.endAt?.toISOString() ?? null, timingType: item.startAt ? 'fixed_slot' as const : 'deadline' as const })),
      ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')),
      pendingTasks: taskRows.filter(item => item.jobTrackId === row.id && item.kind !== 'assessment' && !item.completedAt && !item.cancelledAt).map(item => ({ id: item.id, title: item.title, at: (item.startAt ?? item.deadlineAt)?.toISOString() ?? null, endAt: item.endAt?.toISOString() ?? null, timingType: item.startAt ? 'fixed_slot' as const : 'deadline' as const })),
      latestEvent: latestByJob.has(row.id) ? { ...latestByJob.get(row.id)!, occurredAt: latestByJob.get(row.id)!.occurredAt.toISOString() } : null,
      waitingDays: jobWaitingDays(buildJobTrackFacts(row, assessmentRows, interviewRows, taskRows), now),
      hasResume: Boolean(row.resumeId),
      lastProgressAt: row.lastProgressAt?.toISOString() ?? null,
      actionState: status.actionState,
      attentionFlags: status.attentionFlags,
      currentNext,
      version: row.version,
    } satisfies JobTrackListItem;
  });
  return { type: "job_track_list", items, counts };
}

function buildCurrentNextFacts(
  job: { id: string; lifecycle: "planned" | "active" | "ended"; submittedAt: Date | null; endedAt: Date | null; endReason: string | null; lastProgressAt: Date | null },
  assessmentRows: AssessmentRow[],
  interviewRows: InterviewRow[],
  taskRows: TaskRow[],
): JobTrackCurrentNextFacts {
  return {
    lifecycle: job.lifecycle,
    submittedAt: job.submittedAt?.toISOString() ?? null,
    endedAt: job.endedAt?.toISOString() ?? null,
    endReason: job.endReason,
    lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
    assessments: assessmentRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      timing: row.timingType === "deadline"
        ? { type: "deadline" as const, deadlineAt: requireDate(row.deadlineAt).toISOString() }
        : { type: "fixed_slot" as const, startAt: requireDate(row.startAt).toISOString(), endAt: requireDate(row.endAt).toISOString() },
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
    interviews: interviewRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      roundLabel: row.roundLabel,
      interviewType: row.interviewType,
      timing: interviewTimingFromRow(row),
      status: row.status,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    })),
    tasks: taskRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      interviewId: row.interviewId,
      kind: row.kind,
      title: row.title,
      deadlineAt: row.deadlineAt?.toISOString() ?? null, startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
  };
}

async function readDashboard(
  db: AppDatabase,
  loaders: ReturnType<typeof createLoaders>,
  userId: string,
  now: Date,
  waitingThreshold = 5,
): Promise<DashboardView> {
  const [jobView, assessmentRows, interviewRows, taskRows] = await Promise.all([
    readJobTracks(db, loaders, userId, undefined, now, waitingThreshold),
    loaders.assessments(userId),
    loaders.interviews(userId),
    loaders.tasks(userId),
  ]);
  const todayEnd = endOfTodayInShanghai(now);
  const todayStart = new Date(todayEnd.getTime() + 1 - 24 * 60 * 60 * 1000);
  const tomorrowStart = new Date(todayEnd.getTime() + 1);
  const dueTaskRows = taskRows.filter(row => row.kind !== "assessment" && !row.completedAt && !row.cancelledAt);
  const todayItems = sortDashboardActionItems([
    ...assessmentRows.filter((row) => row.status === "pending")
      .map((row) => ({ row, dueAt: row.timingType === "deadline" ? row.deadlineAt : row.startAt }))
      .filter((item): item is { row: AssessmentRow; dueAt: Date } => Boolean(item.dueAt && item.dueAt <= todayEnd))
      .map(({ row, dueAt }) => ({
        id: row.id,
        sourceType: "assessment" as const,
        timeSource: row.timingType === "deadline" ? "deadline" as const : "start" as const,
        jobTrackId: row.jobTrackId,
        companyName: row.companyName,
        roleName: row.roleName, department: row.department,
        title: row.title,
        dueAt: dueAt.toISOString(),
        externalUrl: row.assessmentUrl,
        overdue: (row.timingType === "fixed_slot" ? row.endAt ?? dueAt : dueAt) < now,
        endAt: row.endAt?.toISOString() ?? null,
      })),
    ...dueTaskRows.filter(row => !(row.startAt ?? row.deadlineAt) || (row.startAt ?? row.deadlineAt)! <= todayEnd).map((row) => ({
        id: row.id,
        sourceType: "task" as const,
        taskKind: row.kind,
        interviewId: row.interviewId,
        timeSource: row.startAt ? "start" as const : "deadline" as const,
        endAt: row.endAt?.toISOString() ?? null,
        jobTrackId: row.jobTrackId,
        companyName: row.companyName,
        roleName: row.roleName, department: row.department,
        title: row.title,
        dueAt: (row.startAt ?? row.deadlineAt)?.toISOString() ?? null,
        overdue: Boolean((row.endAt ?? row.deadlineAt) && (row.endAt ?? row.deadlineAt)! < now),
      })),
    ...interviewRows.filter(row => row.status === "scheduled" && !row.occurredAt && row.timingType === "fixed_slot" && requireDate(row.startAt) <= todayEnd && requireDate(row.endAt) > now && requireDate(row.endAt) > todayStart).map(row => ({
      id: row.id, sourceType: "interview" as const, jobTrackId: row.jobTrackId, companyName: row.companyName, roleName: row.roleName, department: row.department,
      title: row.roundLabel, dueAt: requireDate(row.startAt).toISOString(), endAt: requireDate(row.endAt).toISOString(), timeSource: "start" as const, externalUrl: row.meetingUrl, overdue: false,
    })),
    ...interviewRows.filter(row => row.status === "scheduled" && !row.occurredAt && row.timingType === "deadline" && requireDate(row.deadlineAt) <= todayEnd).map(row => ({
      id: row.id, sourceType: "interview" as const, jobTrackId: row.jobTrackId, companyName: row.companyName, roleName: row.roleName, department: row.department,
      title: row.roundLabel, dueAt: requireDate(row.deadlineAt).toISOString(), timeSource: "deadline" as const, externalUrl: row.meetingUrl, overdue: requireDate(row.deadlineAt) < now,
    })),
    ...interviewRows.filter((row) => row.status === "scheduled" && interviewEndFromRow(row) <= now && !row.reviewedAt && (row.timingType === "fixed_slot" || Boolean(row.occurredAt)))
      .map((row) => ({
        id: row.id,
        sourceType: "interview_review" as const,
        jobTrackId: row.jobTrackId,
        companyName: row.companyName,
        roleName: row.roleName, department: row.department,
        title: `复盘${row.roundLabel}`,
        dueAt: interviewReviewDeadline(interviewEndFromRow(row)).toISOString(),
        timeSource: "deadline" as const,
        overdue: interviewReviewDeadline(interviewEndFromRow(row)) < now,
      })),
  ] satisfies DashboardActionItem[]);
  const upcomingEnd = new Date(tomorrowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    type: "dashboard",
    counts: jobView.counts,
    todayItems,
    upcomingItems: buildCalendarItems(assessmentRows, interviewRows, taskRows, tomorrowStart, upcomingEnd).filter(item => !todayItems.some(today => today.id === item.id && today.sourceType === item.sourceType)),
    attentionJobs: jobView.items.filter((job) => job.attentionFlags.length > 0),
  };
}

function buildJobTrackFacts(
  job: { id: string; lifecycle: "planned" | "active" | "ended"; submittedAt: Date | null; lastProgressAt?: Date | null },
  assessmentRows: AssessmentRow[],
  interviewRows: InterviewRow[],
  taskRows: TaskRow[],
): JobTrackFacts {
  return {
    lifecycle: job.lifecycle,
    submittedAt: job.submittedAt?.toISOString() ?? null,
    lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
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
      timing: interviewTimingFromRow(row),
      occurredAt: row.occurredAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    })),
    tasks: taskRows.filter((row) => row.jobTrackId === job.id).map((row) => ({
      id: row.id,
      kind: row.kind,
      deadlineAt: row.deadlineAt?.toISOString() ?? null, startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null,
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
      roleName: row.roleName, department: row.department,
      title: [row.roundLabel, row.interviewType].filter(Boolean).join(" · "),
      externalUrl: row.meetingUrl,
      startAt: interviewStartFromRow(row).toISOString(),
      endAt: row.timingType === "fixed_slot" ? requireDate(row.endAt).toISOString() : null,
      isDeadline: row.timingType === "deadline",
      hasConflict: false,
    })),
    ...assessmentRows.filter((row) => row.status === "pending").map((row) => ({
      id: row.id,
      sourceType: "assessment" as const,
      jobTrackId: row.jobTrackId,
      companyName: row.companyName,
      roleName: row.roleName, department: row.department,
      title: row.title,
      externalUrl: row.assessmentUrl,
      startAt: requireDate(row.timingType === "deadline" ? row.deadlineAt : row.startAt).toISOString(),
      endAt: row.timingType === "fixed_slot" ? requireDate(row.endAt).toISOString() : null,
      isDeadline: row.timingType === "deadline",
      hasConflict: false,
    })),
    ...taskRows.filter((row) => row.kind !== "assessment" && !row.completedAt && !row.cancelledAt && (row.deadlineAt || row.startAt)).map((row) => ({
      id: row.id,
      sourceType: "task" as const,
      jobTrackId: row.jobTrackId,
      companyName: row.companyName,
      roleName: row.roleName, department: row.department,
      title: row.title,
      startAt: (row.startAt ?? row.deadlineAt as Date).toISOString(),
      endAt: row.endAt?.toISOString() ?? null,
      isDeadline: !row.startAt,
      hasConflict: false,
    })),
  ].filter((item) => {
    const itemTime = new Date(item.startAt);
    return itemTime < endAt && (itemTime >= startAt || (item.endAt !== null && new Date(item.endAt) > startAt));
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

function interviewTimingFromRow(row: InterviewRow) {
  return row.timingType === "deadline"
    ? { type: "deadline" as const, deadlineAt: requireDate(row.deadlineAt).toISOString() }
    : { type: "fixed_slot" as const, startAt: requireDate(row.startAt).toISOString(), endAt: requireDate(row.endAt).toISOString() };
}

function interviewStartFromRow(row: InterviewRow): Date {
  return requireDate(row.timingType === "deadline" ? row.deadlineAt : row.startAt);
}

function interviewEndFromRow(row: InterviewRow): Date {
  return requireDate(row.timingType === "deadline" ? row.deadlineAt : row.endAt);
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
