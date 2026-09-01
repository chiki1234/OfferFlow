import { randomUUID } from "node:crypto";
import type {
  ActorContext,
  CreateJobTrackCommand,
  JobCommand,
  JobCommandResult,
  JobCommandResultFor,
  JobTrackView,
  JobWorkflow,
  RecordAssessmentInviteCommand,
  RecordAssessmentInviteResult,
  SubmitApplicationCommand,
  SubmitApplicationResult,
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
    case "submit_application":
      return executeSubmitApplication(command, context, transaction, generateId);
    case "record_assessment_invite":
      return executeRecordAssessmentInvite(command, context, transaction, generateId);
  }
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
  };
  const task = timing.type === "deadline"
    ? {
        id: generateId(),
        jobTrackId: jobTrack.id,
        assessmentId,
        kind: "assessment" as const,
        title,
        deadlineAt: timing.deadlineAt,
        completedAt: null,
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
  };
}
