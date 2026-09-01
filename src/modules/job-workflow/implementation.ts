import { randomUUID } from "node:crypto";
import type {
  ActorContext,
  CancelInterviewCommand,
  CancelInterviewResult,
  CancelAssessmentCommand,
  CancelAssessmentResult,
  CompleteAssessmentCommand,
  CompleteAssessmentResult,
  CompleteInterviewReviewCommand,
  CompleteInterviewReviewResult,
  ConfirmInterviewOccurredCommand,
  ConfirmInterviewOccurredResult,
  CompleteTaskCommand,
  CompleteTaskResult,
  CancelTaskCommand,
  CancelTaskResult,
  CreateTaskCommand,
  CreateTaskResult,
  UpdateTaskCommand,
  UpdateTaskResult,
  DeletePlannedJobTrackCommand,
  DeletePlannedJobTrackResult,
  EndJobTrackResult,
  EndJobTrackCommand,
  CreateJobTrackCommand,
  JobCommand,
  JobCommandResult,
  JobCommandResultFor,
  JobTrackView,
  JobWorkflow,
  RecordAssessmentInviteCommand,
  RecordAssessmentInviteResult,
  RecordRejectionCommand,
  QuickImportJobTracksCommand,
  QuickImportJobTracksResult,
  RecordGenericProgressCommand,
  RecordGenericProgressResult,
  RescheduleInterviewCommand,
  RescheduleInterviewResult,
  ScheduleInterviewCommand,
  ScheduleInterviewResult,
  SaveInterviewTranscriptCommand,
  SaveInterviewTranscriptResult,
  SubmitApplicationCommand,
  SubmitApplicationResult,
  UpdateJobTrackContextCommand,
  UpdateJobTrackContextResult,
} from "./interface";
import type { JobWorkflowStore, JobWorkflowTransaction, StoredJobTrack } from "./store";

type JobWorkflowDependencies = {
  store: JobWorkflowStore;
  generateId?: () => string;
  now?: () => Date;
};

export function createJobWorkflow({
  store,
  generateId = randomUUID,
  now = () => new Date(),
}: JobWorkflowDependencies): JobWorkflow {
  return {
    execute<TCommand extends JobCommand>(
      command: TCommand,
      context: ActorContext,
    ): Promise<JobCommandResultFor<TCommand>> {
      return store.transaction(async (transaction) => {
        const previous = await transaction.findReceipt(context.userId, command.idempotencyKey);
        if (previous) {
          return previous;
        }

        const result = await executeCommand(
          command,
          context,
          transaction,
          generateId,
          now,
        );
        await transaction.saveReceipt({
          userId: context.userId,
          idempotencyKey: command.idempotencyKey,
          commandType: command.type,
          result,
        });
        return result;
      }) as Promise<JobCommandResultFor<TCommand>>;
    },
  };
}

async function executeCommand(
  command: JobCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
  now: () => Date,
): Promise<JobCommandResult> {
  switch (command.type) {
    case "create_job_track":
      return executeCreateJobTrack(command, context, transaction, generateId, now);
    case "update_job_track_context":
      return executeUpdateJobTrackContext(command, context, transaction);
    case "submit_application":
      return executeSubmitApplication(command, context, transaction, generateId);
    case "record_assessment_invite":
      return executeRecordAssessmentInvite(command, context, transaction, generateId);
    case "complete_assessment":
      return executeCompleteAssessment(command, context, transaction, generateId);
    case "cancel_assessment":
      return executeCancelAssessment(command, context, transaction, generateId);
    case "schedule_interview":
      return executeScheduleInterview(command, context, transaction, generateId);
    case "reschedule_interview":
      return executeRescheduleInterview(command, context, transaction, generateId);
    case "cancel_interview":
      return executeCancelInterview(command, context, transaction, generateId);
    case "confirm_interview_occurred":
      return executeConfirmInterviewOccurred(command, context, transaction, generateId);
    case "complete_interview_review":
      return executeCompleteInterviewReview(command, context, transaction, generateId);
    case "save_interview_transcript":
      return executeSaveInterviewTranscript(command, context, transaction, generateId);
    case "create_task":
      return executeCreateTask(command, context, transaction, generateId);
    case "update_task":
      return executeUpdateTask(command, context, transaction);
    case "complete_task":
      return executeCompleteTask(command, context, transaction);
    case "cancel_task":
      return executeCancelTask(command, context, transaction);
    case "record_rejection":
      return executeRecordRejection(command, context, transaction, generateId);
    case "end_job_track":
      return executeEndJobTrack(command, context, transaction, generateId);
    case "quick_import_job_tracks":
      return executeQuickImportJobTracks(command, context, transaction, generateId, now);
    case "record_generic_progress":
      return executeRecordGenericProgress(command, context, transaction, generateId);
    case "delete_planned_job_track":
      return executeDeletePlannedJobTrack(command, context, transaction);
  }
}

async function executeCancelTask(
  command: CancelTaskCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
): Promise<CancelTaskResult> {
  const existing = await transaction.findTask(context.userId, command.taskId);
  if (!existing) throw new Error("NOT_FOUND: task was not found");
  if (existing.kind === "assessment") throw new Error("CONFLICT: assessment task must be cancelled through cancel_assessment");
  if (existing.completedAt || existing.cancelledAt) throw new Error("CONFLICT: only an open task can be cancelled");
  const task = await transaction.cancelTask({ userId: context.userId, taskId: existing.id, cancelledAt: parseTimestamp(command.cancelledAt, "cancelledAt") });
  return { outcome: "task_cancelled", task };
}

async function executeSaveInterviewTranscript(
  command: SaveInterviewTranscriptCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<SaveInterviewTranscriptResult> {
  const existing = await transaction.findInterview(context.userId, command.interviewId);
  if (!existing) throw new Error("NOT_FOUND: interview was not found");
  if (existing.status === "cancelled") throw new Error("CONFLICT: cancelled interview cannot receive a transcript");
  const transcriptText = command.transcriptText.trim();
  if (!transcriptText) throw new Error("VALIDATION_ERROR: transcript text is required");
  const savedAt = parseTimestamp(command.savedAt, "savedAt");
  const occurredAt = existing.occurredAt ?? savedAt;
  const interview = await transaction.saveInterviewTranscript({
    userId: context.userId, interviewId: existing.id, transcriptText, occurredAt, savedAt,
  });
  const occurredEvent = existing.occurredAt ? null : await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: `${command.idempotencyKey}:occurred`,
    kind: "InterviewOccurred", jobTrackId: interview.jobTrackId,
    subjectType: "interview", subjectId: interview.id, occurredAt,
    payload: { confirmedBy: "transcript" },
  });
  return { outcome: "transcript_saved", interview, occurredEvent };
}

async function executeUpdateJobTrackContext(
  command: UpdateJobTrackContextCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
): Promise<UpdateJobTrackContextResult> {
  const existing = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!existing) throw new Error("NOT_FOUND: job track was not found");
  const companyName = command.companyName.trim();
  const roleName = command.roleName.trim();
  const text = command.jobDescription.text?.trim() || null;
  const imageAssetIds = command.jobDescription.imageAssetIds ?? [];
  if (!companyName || !roleName) throw new Error("VALIDATION_ERROR: companyName and roleName are required");
  if (!text && imageAssetIds.length === 0 && existing.createdVia !== "quick_import") throw new Error("VALIDATION_ERROR: jobDescription requires text or an image");
  const updated = await transaction.updateJobTrackContext({
    userId: context.userId, jobTrackId: existing.id, version: command.version,
    companyName, roleName, jobUrl: command.jobUrl?.trim() || null,
    jobDescription: { text, imageAssetIds },
  });
  if (!updated) throw new Error("CONFLICT: job track was changed by another action");
  return { outcome: "context_updated", jobTrack: toJobTrackView(updated) };
}

async function executeDeletePlannedJobTrack(
  command: DeletePlannedJobTrackCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
): Promise<DeletePlannedJobTrackResult> {
  const jobTrack = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!jobTrack) throw new Error("NOT_FOUND: job track was not found");
  if (jobTrack.lifecycle !== "planned") throw new Error("CONFLICT: only a planned job track can be deleted");
  await transaction.deleteJobTrack(context.userId, jobTrack.id);
  return { outcome: "job_track_deleted", jobTrackId: jobTrack.id };
}

async function executeCancelAssessment(
  command: CancelAssessmentCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<CancelAssessmentResult> {
  const existing = await transaction.findAssessmentWithTask(context.userId, command.assessmentId);
  if (!existing) throw new Error("NOT_FOUND: assessment was not found");
  if (existing.assessment.status !== "pending") throw new Error("CONFLICT: only a pending assessment can be cancelled");
  const cancelledAt = parseTimestamp(command.cancelledAt, "cancelledAt");
  const cancelled = await transaction.cancelAssessmentWithTask({ userId: context.userId, assessmentId: existing.assessment.id, cancelledAt });
  const event = await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: command.idempotencyKey,
    kind: "AssessmentCancelled", jobTrackId: cancelled.assessment.jobTrackId,
    subjectType: "assessment", subjectId: cancelled.assessment.id, occurredAt: cancelledAt, payload: {},
  });
  return { outcome: "assessment_cancelled", assessment: cancelled.assessment, task: cancelled.task, event };
}

async function executeRecordGenericProgress(
  command: RecordGenericProgressCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<RecordGenericProgressResult> {
  const jobTrack = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!jobTrack) throw new Error("NOT_FOUND: job track was not found");
  if (jobTrack.lifecycle !== "active") throw new Error("CONFLICT: progress can only be recorded on an active job track");
  const summary = command.summary.trim();
  if (!summary) throw new Error("VALIDATION_ERROR: progress summary is required");
  const event = await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: command.idempotencyKey,
    kind: "GenericProgress", jobTrackId: jobTrack.id, subjectType: "job_track",
    subjectId: jobTrack.id, occurredAt: parseTimestamp(command.occurredAt, "occurredAt"),
    payload: { summary },
  });
  return { outcome: "progress_recorded", event };
}

async function executeQuickImportJobTracks(
  command: QuickImportJobTracksCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
  now: () => Date,
): Promise<QuickImportJobTracksResult> {
  if (command.entries.length === 0 || command.entries.length > 100) throw new Error("VALIDATION_ERROR: quick import requires 1 to 100 entries");
  const createdAt = now().toISOString();
  const jobTracks = [];
  for (const entry of command.entries) {
    const companyName = entry.companyName.trim();
    const roleName = entry.roleName.trim();
    if (!companyName || !roleName) throw new Error("VALIDATION_ERROR: companyName and roleName are required");
    const stored = await transaction.insertJobTrack({
      id: generateId(), userId: context.userId, companyName, roleName,
      lifecycle: command.lifecycle, jobUrl: null, resumeId: null, submittedAt: null,
      createdAt, createdVia: "quick_import", jobDescription: { text: null, imageAssetIds: [] },
      version: 1,
    });
    jobTracks.push(toJobTrackView(stored));
  }
  return { outcome: "job_tracks_imported", jobTracks };
}

async function executeEndJobTrack(
  command: EndJobTrackCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<EndJobTrackResult> {
  const existing = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!existing) throw new Error("NOT_FOUND: job track was not found");
  if (existing.lifecycle !== "active") throw new Error("CONFLICT: only an active job track can be ended");
  const reason = command.reason.trim();
  if (!reason) throw new Error("VALIDATION_ERROR: end reason is required");
  const occurredAt = parseTimestamp(command.occurredAt, "occurredAt");
  const ended = await transaction.endJobTrack({ userId: context.userId, jobTrackId: existing.id, endedAt: occurredAt, endReason: reason });
  const event = await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: command.idempotencyKey,
    kind: "JobTrackEnded", jobTrackId: ended.id, subjectType: "job_track",
    subjectId: ended.id, occurredAt, payload: { reason },
  });
  return { outcome: "job_track_ended", jobTrack: toJobTrackView(ended), event };
}

async function executeRecordRejection(
  command: RecordRejectionCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<EndJobTrackResult> {
  const existing = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!existing) throw new Error("NOT_FOUND: job track was not found");
  if (existing.lifecycle !== "active") throw new Error("CONFLICT: only an active job track can receive a rejection");
  const occurredAt = parseTimestamp(command.occurredAt, "occurredAt");
  const ended = await transaction.endJobTrack({
    userId: context.userId,
    jobTrackId: existing.id,
    endedAt: occurredAt,
    endReason: "rejected",
  });
  const event = await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: command.idempotencyKey,
    kind: "RejectionReceived", jobTrackId: ended.id,
    subjectType: "job_track", subjectId: ended.id, occurredAt,
    payload: { notes: command.notes?.trim() || null },
  });
  return { outcome: "job_track_ended", jobTrack: toJobTrackView(ended), event };
}

async function executeCreateTask(
  command: CreateTaskCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<CreateTaskResult> {
  const jobTrack = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!jobTrack) throw new Error("NOT_FOUND: job track was not found");
  if (jobTrack.lifecycle !== "active") throw new Error("CONFLICT: tasks can only be added to an active job track");
  const title = command.title.trim();
  if (!title) throw new Error("VALIDATION_ERROR: task title is required");
  const interviewId = command.interviewId ?? null;
  if (command.kind === "interview_prep" && !interviewId) throw new Error("VALIDATION_ERROR: interview preparation task requires an interview");
  if (interviewId) {
    const interview = await transaction.findInterview(context.userId, interviewId);
    if (!interview || interview.jobTrackId !== jobTrack.id) throw new Error("NOT_FOUND: interview was not found in this job track");
  }
  const task = await transaction.insertTask({
    userId: context.userId,
    task: {
      id: generateId(), jobTrackId: jobTrack.id, interviewId, assessmentId: null,
      kind: command.kind, title,
      deadlineAt: command.deadlineAt ? parseTimestamp(command.deadlineAt, "deadlineAt") : null,
      completedAt: null, cancelledAt: null,
    },
  });
  return { outcome: "task_created", task };
}

async function executeUpdateTask(
  command: UpdateTaskCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
): Promise<UpdateTaskResult> {
  const existing = await transaction.findTask(context.userId, command.taskId);
  if (!existing) throw new Error("NOT_FOUND: task was not found");
  if (existing.kind === "assessment") throw new Error("CONFLICT: assessment task must be updated through its assessment");
  if (existing.completedAt || existing.cancelledAt) throw new Error("CONFLICT: only an open task can be updated");
  if (!existing.jobTrackId) throw new Error("CONFLICT: task is not attached to a job track");
  const title = command.title.trim();
  if (!title) throw new Error("VALIDATION_ERROR: task title is required");
  const interviewId = command.interviewId ?? null;
  if (interviewId) {
    const interview = await transaction.findInterview(context.userId, interviewId);
    if (!interview || interview.jobTrackId !== existing.jobTrackId) {
      throw new Error("NOT_FOUND: interview was not found in this job track");
    }
  }
  const task = await transaction.updateTask({
    userId: context.userId,
    taskId: existing.id,
    title,
    deadlineAt: command.deadlineAt ? parseTimestamp(command.deadlineAt, "deadlineAt") : null,
    interviewId,
  });
  return { outcome: "task_updated", task };
}

async function executeCompleteTask(
  command: CompleteTaskCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
): Promise<CompleteTaskResult> {
  const existing = await transaction.findTask(context.userId, command.taskId);
  if (!existing) throw new Error("NOT_FOUND: task was not found");
  if (existing.kind === "assessment") throw new Error("CONFLICT: assessment task must be completed through complete_assessment");
  if (existing.completedAt || existing.cancelledAt) throw new Error("CONFLICT: only an open task can be completed");
  const task = await transaction.completeTask({
    userId: context.userId,
    taskId: existing.id,
    completedAt: parseTimestamp(command.completedAt, "completedAt"),
  });
  return { outcome: "task_completed", task };
}

async function executeCompleteInterviewReview(
  command: CompleteInterviewReviewCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<CompleteInterviewReviewResult> {
  const existing = await transaction.findInterview(context.userId, command.interviewId);
  if (!existing) throw new Error("NOT_FOUND: interview was not found");
  if (existing.status === "cancelled") throw new Error("CONFLICT: a cancelled interview cannot be reviewed");
  if (existing.reviewedAt) throw new Error("CONFLICT: interview review is already completed");
  const reviewedAt = parseTimestamp(command.reviewedAt, "reviewedAt");
  const occurredAt = existing.occurredAt ?? reviewedAt;
  const interview = await transaction.completeInterviewReview({
    userId: context.userId,
    interviewId: existing.id,
    occurredAt,
    reviewedAt,
  });
  const occurredEvent = existing.occurredAt ? null : await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: `${command.idempotencyKey}:occurred`,
    kind: "InterviewOccurred", jobTrackId: interview.jobTrackId,
    subjectType: "interview", subjectId: interview.id, occurredAt, payload: { confirmedBy: "review" },
  });
  const event = await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: command.idempotencyKey,
    kind: "InterviewReviewed", jobTrackId: interview.jobTrackId,
    subjectType: "interview", subjectId: interview.id, occurredAt: reviewedAt, payload: {},
  });
  return { outcome: "interview_reviewed", interview, occurredEvent, event };
}

async function executeConfirmInterviewOccurred(
  command: ConfirmInterviewOccurredCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<ConfirmInterviewOccurredResult> {
  const existing = await transaction.findInterview(context.userId, command.interviewId);
  if (!existing) throw new Error("NOT_FOUND: interview was not found");
  if (existing.status === "cancelled") throw new Error("CONFLICT: a cancelled interview cannot occur");
  if (existing.occurredAt) throw new Error("CONFLICT: interview occurrence is already confirmed");
  const occurredAt = parseTimestamp(command.occurredAt, "occurredAt");
  const interview = await transaction.markInterviewOccurred({
    userId: context.userId,
    interviewId: existing.id,
    occurredAt,
  });
  const event = await transaction.insertEvent({
    id: generateId(), userId: context.userId, actionId: command.idempotencyKey,
    kind: "InterviewOccurred", jobTrackId: interview.jobTrackId,
    subjectType: "interview", subjectId: interview.id, occurredAt, payload: {},
  });
  return { outcome: "interview_occurred", interview, event };
}

async function executeCancelInterview(
  command: CancelInterviewCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<CancelInterviewResult> {
  const existing = await transaction.findInterview(context.userId, command.interviewId);
  if (!existing) {
    throw new Error("NOT_FOUND: interview was not found");
  }
  if (existing.status !== "scheduled") {
    throw new Error("CONFLICT: only a scheduled interview can be cancelled");
  }
  const cancelledAt = parseTimestamp(command.cancelledAt, "cancelledAt");
  const interview = await transaction.cancelInterviewWithPreparationTasks({
    userId: context.userId,
    interviewId: existing.id,
    cancelledAt,
  });
  const event = await transaction.insertEvent({
    id: generateId(),
    userId: context.userId,
    actionId: command.idempotencyKey,
    kind: "InterviewCancelled",
    jobTrackId: interview.jobTrackId,
    subjectType: "interview",
    subjectId: interview.id,
    occurredAt: cancelledAt,
    payload: { reason: command.reason?.trim() || null },
  });

  return { outcome: "interview_cancelled", interview, event };
}

async function executeRescheduleInterview(
  command: RescheduleInterviewCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<RescheduleInterviewResult> {
  const existing = await transaction.findInterview(context.userId, command.interviewId);
  if (!existing) {
    throw new Error("NOT_FOUND: interview was not found");
  }
  if (existing.status !== "scheduled") {
    throw new Error("CONFLICT: only a scheduled interview can be rescheduled");
  }
  const startAt = parseTimestamp(command.startAt, "startAt");
  const endAt = parseTimestamp(command.endAt, "endAt");
  if (new Date(startAt) >= new Date(endAt)) {
    throw new Error("VALIDATION_ERROR: interview endAt must be after startAt");
  }

  const interview = await transaction.updateInterviewSchedule({
    userId: context.userId,
    interviewId: existing.id,
    startAt,
    endAt,
  });
  const event = await transaction.insertEvent({
    id: generateId(),
    userId: context.userId,
    actionId: command.idempotencyKey,
    kind: "InterviewRescheduled",
    jobTrackId: interview.jobTrackId,
    subjectType: "interview",
    subjectId: interview.id,
    occurredAt: parseTimestamp(command.changedAt, "changedAt"),
    payload: {
      previousStartAt: existing.startAt,
      previousEndAt: existing.endAt,
      startAt,
      endAt,
    },
  });

  return { outcome: "interview_rescheduled", interview, event };
}

async function executeScheduleInterview(
  command: ScheduleInterviewCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<ScheduleInterviewResult> {
  const jobTrack = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!jobTrack) {
    throw new Error("NOT_FOUND: job track was not found");
  }
  if (jobTrack.lifecycle !== "active") {
    throw new Error("CONFLICT: interviews can only be added to an active job track");
  }

  const roundLabel = command.roundLabel.trim();
  const interviewType = command.interviewType.trim();
  if (!roundLabel || !interviewType) {
    throw new Error("VALIDATION_ERROR: roundLabel and interviewType are required");
  }
  const startAt = parseTimestamp(command.startAt, "startAt");
  const endAt = parseTimestamp(command.endAt, "endAt");
  if (new Date(startAt) >= new Date(endAt)) {
    throw new Error("VALIDATION_ERROR: interview endAt must be after startAt");
  }
  const sequenceNo = command.sequenceNo ?? null;
  if (sequenceNo !== null && (!Number.isInteger(sequenceNo) || sequenceNo < 1)) {
    throw new Error("VALIDATION_ERROR: sequenceNo must be a positive integer");
  }

  const interview = await transaction.insertInterview({
    id: generateId(),
    jobTrackId: jobTrack.id,
    sequenceNo,
    roundLabel,
    interviewType,
    startAt,
    endAt,
    meetingUrl: command.meetingUrl?.trim() || null,
    notes: command.notes?.trim() || null,
    status: "scheduled",
    cancelledAt: null,
    occurredAt: null,
    reviewedAt: null,
    transcriptText: null,
  });
  const event = await transaction.insertEvent({
    id: generateId(),
    userId: context.userId,
    actionId: command.idempotencyKey,
    kind: "InterviewInvited",
    jobTrackId: jobTrack.id,
    subjectType: "interview",
    subjectId: interview.id,
    occurredAt: parseTimestamp(command.receivedAt, "receivedAt"),
    payload: {},
  });

  return { outcome: "interview_scheduled", interview, event };
}

async function executeCompleteAssessment(
  command: CompleteAssessmentCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<CompleteAssessmentResult> {
  const existing = await transaction.findAssessmentWithTask(
    context.userId,
    command.assessmentId,
  );
  if (!existing) {
    throw new Error("NOT_FOUND: assessment was not found");
  }
  if (existing.assessment.status !== "pending") {
    throw new Error("CONFLICT: only a pending assessment can be completed");
  }

  const completedAt = parseTimestamp(command.completedAt, "completedAt");
  const completed = await transaction.completeAssessmentWithTask({
    userId: context.userId,
    assessmentId: existing.assessment.id,
    completedAt,
  });
  const event = await transaction.insertEvent({
    id: generateId(),
    userId: context.userId,
    actionId: command.idempotencyKey,
    kind: "AssessmentCompleted",
    jobTrackId: completed.assessment.jobTrackId,
    subjectType: "assessment",
    subjectId: completed.assessment.id,
    occurredAt: completedAt,
    payload: {},
  });

  return {
    outcome: "assessment_completed",
    assessment: completed.assessment,
    task: completed.task,
    event,
  };
}

async function executeRecordAssessmentInvite(
  command: RecordAssessmentInviteCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<RecordAssessmentInviteResult> {
  const jobTrack = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!jobTrack) {
    throw new Error("NOT_FOUND: job track was not found");
  }
  if (jobTrack.lifecycle !== "active") {
    throw new Error("CONFLICT: assessments can only be added to an active job track");
  }

  const title = command.title.trim();
  if (!title) {
    throw new Error("VALIDATION_ERROR: assessment title is required");
  }
  const receivedAt = parseTimestamp(command.receivedAt, "receivedAt");
  const assessmentId = generateId();
  const timing = normalizeAssessmentTiming(command.timing);
  const assessment = {
    id: assessmentId,
    jobTrackId: jobTrack.id,
    kind: command.assessmentKind,
    title,
    timing,
    status: "pending" as const,
    completedAt: null,
    cancelledAt: null,
  };
  const task = timing.type === "deadline"
    ? {
        id: generateId(),
        jobTrackId: jobTrack.id,
        interviewId: null,
        assessmentId,
        kind: "assessment" as const,
        title,
        deadlineAt: timing.deadlineAt,
        completedAt: null,
        cancelledAt: null,
      }
    : null;
  const created = await transaction.insertAssessmentWithTask({
    userId: context.userId,
    assessment,
    task,
  });
  const event = await transaction.insertEvent({
    id: generateId(),
    userId: context.userId,
    actionId: command.idempotencyKey,
    kind: "AssessmentInvited",
    jobTrackId: jobTrack.id,
    subjectType: "assessment",
    subjectId: assessmentId,
    occurredAt: receivedAt,
    payload: {},
  });

  return {
    outcome: "assessment_recorded",
    assessment: created.assessment,
    task: created.task,
    event,
  };
}

function normalizeAssessmentTiming(
  timing: RecordAssessmentInviteCommand["timing"],
): RecordAssessmentInviteCommand["timing"] {
  if (timing.type === "deadline") {
    return { type: "deadline", deadlineAt: parseTimestamp(timing.deadlineAt, "deadlineAt") };
  }
  const startAt = parseTimestamp(timing.startAt, "startAt");
  const endAt = parseTimestamp(timing.endAt, "endAt");
  if (new Date(startAt) >= new Date(endAt)) {
    throw new Error("VALIDATION_ERROR: assessment endAt must be after startAt");
  }
  return { type: "fixed_slot", startAt, endAt };
}

function parseTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`VALIDATION_ERROR: ${field} must be an ISO timestamp`);
  }
  return timestamp.toISOString();
}

async function executeCreateJobTrack(
  command: CreateJobTrackCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
  now: () => Date,
): Promise<JobCommandResult> {
  const companyName = command.companyName.trim();
  const roleName = command.roleName.trim();
  const descriptionText = command.jobDescription.text?.trim() || null;
  const imageAssetIds = command.jobDescription.imageAssetIds ?? [];

  if (!companyName || !roleName) {
    throw new Error("VALIDATION_ERROR: companyName and roleName are required");
  }
  if (!descriptionText && imageAssetIds.length === 0) {
    throw new Error("VALIDATION_ERROR: jobDescription requires text or an image");
  }

  const stored = await transaction.insertJobTrack({
    id: generateId(),
    userId: context.userId,
    companyName,
    roleName,
    lifecycle: "planned",
    jobUrl: command.jobUrl?.trim() || null,
    resumeId: null,
    submittedAt: null,
    createdAt: now().toISOString(),
    createdVia: "normal",
    version: 1,
    jobDescription: {
      text: descriptionText,
      imageAssetIds,
    },
  });

  return {
    outcome: "created",
    jobTrack: toJobTrackView(stored),
  };
}

async function executeSubmitApplication(
  command: SubmitApplicationCommand,
  context: ActorContext,
  transaction: JobWorkflowTransaction,
  generateId: () => string,
): Promise<SubmitApplicationResult> {
  const jobTrack = await transaction.findJobTrack(context.userId, command.jobTrackId);
  if (!jobTrack) {
    throw new Error("NOT_FOUND: job track was not found");
  }

  const resume = await transaction.findResume(context.userId, command.resumeId);
  if (!resume) {
    throw new Error("NOT_FOUND: resume was not found");
  }
  if (jobTrack.lifecycle !== "planned") {
    throw new Error("CONFLICT: only a planned job track can be submitted");
  }

  const submittedAt = new Date(command.submittedAt);
  if (Number.isNaN(submittedAt.getTime())) {
    throw new Error("VALIDATION_ERROR: submittedAt must be an ISO timestamp");
  }
  const occurredAt = submittedAt.toISOString();
  const updated = await transaction.markApplicationSubmitted({
    userId: context.userId,
    jobTrackId: jobTrack.id,
    resumeId: resume.id,
    submittedAt: occurredAt,
  });
  const event = await transaction.insertEvent({
    id: generateId(),
    userId: context.userId,
    actionId: command.idempotencyKey,
    kind: "ApplicationSubmitted",
    jobTrackId: jobTrack.id,
    subjectType: "job_track",
    subjectId: jobTrack.id,
    occurredAt,
    payload: {},
  });

  return {
    outcome: "submitted",
    jobTrack: toJobTrackView(updated),
    event,
  };
}

function toJobTrackView(jobTrack: StoredJobTrack): JobTrackView {
  return {
    id: jobTrack.id,
    companyName: jobTrack.companyName,
    roleName: jobTrack.roleName,
    lifecycle: jobTrack.lifecycle,
    jobUrl: jobTrack.jobUrl,
    resumeId: jobTrack.resumeId,
    submittedAt: jobTrack.submittedAt,
    createdAt: jobTrack.createdAt,
    version: jobTrack.version,
  };
}
