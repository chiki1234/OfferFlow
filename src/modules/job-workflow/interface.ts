export type ActorContext = {
  userId: string;
};

export type JobDescriptionInput = {
  text?: string;
  imageAssetIds?: string[];
};

export type CreateJobTrackCommand = {
  type: "create_job_track";
  idempotencyKey: string;
  companyName: string;
  roleName: string;
  jobDescription: JobDescriptionInput;
  jobUrl?: string;
};

export type SubmitApplicationCommand = {
  type: "submit_application";
  idempotencyKey: string;
  jobTrackId: string;
  resumeId: string;
  submittedAt: string;
};

export type AssessmentTiming =
  | { type: "deadline"; deadlineAt: string }
  | { type: "fixed_slot"; startAt: string; endAt: string };

export type RecordAssessmentInviteCommand = {
  type: "record_assessment_invite";
  idempotencyKey: string;
  jobTrackId: string;
  assessmentKind: "assessment" | "written_test";
  title: string;
  timing: AssessmentTiming;
  receivedAt: string;
};

export type CompleteAssessmentCommand = {
  type: "complete_assessment";
  idempotencyKey: string;
  assessmentId: string;
  completedAt: string;
};

export type ScheduleInterviewCommand = {
  type: "schedule_interview";
  idempotencyKey: string;
  jobTrackId: string;
  sequenceNo?: number;
  roundLabel: string;
  interviewType: string;
  startAt: string;
  endAt: string;
  meetingUrl?: string;
  notes?: string;
  receivedAt: string;
};

export type RescheduleInterviewCommand = {
  type: "reschedule_interview";
  idempotencyKey: string;
  interviewId: string;
  startAt: string;
  endAt: string;
  changedAt: string;
};

export type CancelInterviewCommand = {
  type: "cancel_interview";
  idempotencyKey: string;
  interviewId: string;
  reason?: string;
  cancelledAt: string;
};

export type ConfirmInterviewOccurredCommand = {
  type: "confirm_interview_occurred";
  idempotencyKey: string;
  interviewId: string;
  occurredAt: string;
};

export type CompleteInterviewReviewCommand = {
  type: "complete_interview_review";
  idempotencyKey: string;
  interviewId: string;
  reviewedAt: string;
};

export type CreateTaskCommand = {
  type: "create_task";
  idempotencyKey: string;
  jobTrackId: string;
  interviewId?: string;
  kind: "generic" | "interview_prep";
  title: string;
  deadlineAt?: string;
};

export type CompleteTaskCommand = {
  type: "complete_task";
  idempotencyKey: string;
  taskId: string;
  completedAt: string;
};

export type RecordRejectionCommand = {
  type: "record_rejection";
  idempotencyKey: string;
  jobTrackId: string;
  occurredAt: string;
  notes?: string;
};

export type EndJobTrackCommand = {
  type: "end_job_track";
  idempotencyKey: string;
  jobTrackId: string;
  reason: string;
  occurredAt: string;
};

export type QuickImportJobTracksCommand = {
  type: "quick_import_job_tracks";
  idempotencyKey: string;
  lifecycle: "planned" | "active";
  entries: Array<{ companyName: string; roleName: string }>;
};

export type JobCommand =
  | CreateJobTrackCommand
  | SubmitApplicationCommand
  | RecordAssessmentInviteCommand
  | CompleteAssessmentCommand
  | ScheduleInterviewCommand
  | RescheduleInterviewCommand
  | CancelInterviewCommand
  | ConfirmInterviewOccurredCommand
  | CompleteInterviewReviewCommand
  | CreateTaskCommand
  | CompleteTaskCommand
  | RecordRejectionCommand
  | EndJobTrackCommand
  | QuickImportJobTracksCommand;

export type JobTrackView = {
  id: string;
  companyName: string;
  roleName: string;
  lifecycle: "planned" | "active" | "ended";
  jobUrl: string | null;
  resumeId: string | null;
  submittedAt: string | null;
  createdAt: string;
};

export type JobEventView = {
  id: string;
  kind:
    | "ApplicationSubmitted"
    | "AssessmentInvited"
    | "AssessmentCompleted"
    | "InterviewInvited"
    | "InterviewRescheduled"
    | "InterviewCancelled"
    | "InterviewOccurred"
    | "InterviewReviewed"
    | "RejectionReceived"
    | "JobTrackEnded";
  jobTrackId: string;
  subjectType: "job_track" | "assessment" | "interview" | "task";
  subjectId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type AssessmentView = {
  id: string;
  jobTrackId: string;
  kind: "assessment" | "written_test";
  title: string;
  timing: AssessmentTiming;
  status: "pending" | "completed" | "cancelled";
  completedAt: string | null;
  cancelledAt: string | null;
};

export type TaskView = {
  id: string;
  jobTrackId: string | null;
  interviewId: string | null;
  assessmentId: string | null;
  kind: "generic" | "interview_prep" | "assessment";
  title: string;
  deadlineAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type InterviewView = {
  id: string;
  jobTrackId: string;
  sequenceNo: number | null;
  roundLabel: string;
  interviewType: string;
  startAt: string;
  endAt: string;
  meetingUrl: string | null;
  notes: string | null;
  status: "scheduled" | "cancelled";
  cancelledAt: string | null;
  occurredAt: string | null;
  reviewedAt: string | null;
};

export type CreateJobTrackResult = {
  outcome: "created";
  jobTrack: JobTrackView;
};

export type SubmitApplicationResult = {
  outcome: "submitted";
  jobTrack: JobTrackView;
  event: JobEventView;
};

export type RecordAssessmentInviteResult = {
  outcome: "assessment_recorded";
  assessment: AssessmentView;
  task: TaskView | null;
  event: JobEventView;
};

export type CompleteAssessmentResult = {
  outcome: "assessment_completed";
  assessment: AssessmentView;
  task: TaskView | null;
  event: JobEventView;
};

export type ScheduleInterviewResult = {
  outcome: "interview_scheduled";
  interview: InterviewView;
  event: JobEventView;
};

export type RescheduleInterviewResult = {
  outcome: "interview_rescheduled";
  interview: InterviewView;
  event: JobEventView;
};

export type CancelInterviewResult = {
  outcome: "interview_cancelled";
  interview: InterviewView;
  event: JobEventView;
};

export type ConfirmInterviewOccurredResult = {
  outcome: "interview_occurred";
  interview: InterviewView;
  event: JobEventView;
};

export type CompleteInterviewReviewResult = {
  outcome: "interview_reviewed";
  interview: InterviewView;
  occurredEvent: JobEventView | null;
  event: JobEventView;
};

export type CreateTaskResult = { outcome: "task_created"; task: TaskView };
export type CompleteTaskResult = { outcome: "task_completed"; task: TaskView };
export type EndJobTrackResult = { outcome: "job_track_ended"; jobTrack: JobTrackView; event: JobEventView };
export type QuickImportJobTracksResult = { outcome: "job_tracks_imported"; jobTracks: JobTrackView[] };

export type JobCommandResult =
  | CreateJobTrackResult
  | SubmitApplicationResult
  | RecordAssessmentInviteResult
  | CompleteAssessmentResult
  | ScheduleInterviewResult
  | RescheduleInterviewResult
  | CancelInterviewResult
  | ConfirmInterviewOccurredResult
  | CompleteInterviewReviewResult
  | CreateTaskResult
  | CompleteTaskResult
  | EndJobTrackResult
  | QuickImportJobTracksResult;

export type JobCommandResultFor<TCommand extends JobCommand> =
  TCommand extends CreateJobTrackCommand
    ? CreateJobTrackResult
    : TCommand extends SubmitApplicationCommand
      ? SubmitApplicationResult
      : TCommand extends RecordAssessmentInviteCommand
        ? RecordAssessmentInviteResult
        : TCommand extends CompleteAssessmentCommand
          ? CompleteAssessmentResult
          : TCommand extends ScheduleInterviewCommand
            ? ScheduleInterviewResult
            : TCommand extends RescheduleInterviewCommand
              ? RescheduleInterviewResult
              : TCommand extends CancelInterviewCommand
                ? CancelInterviewResult
                : TCommand extends ConfirmInterviewOccurredCommand
                  ? ConfirmInterviewOccurredResult
                  : TCommand extends CompleteInterviewReviewCommand
                    ? CompleteInterviewReviewResult
                    : TCommand extends CreateTaskCommand
                      ? CreateTaskResult
                      : TCommand extends CompleteTaskCommand
                        ? CompleteTaskResult
                        : TCommand extends RecordRejectionCommand
                          ? EndJobTrackResult
                          : TCommand extends EndJobTrackCommand
                            ? EndJobTrackResult
                            : TCommand extends QuickImportJobTracksCommand
                              ? QuickImportJobTracksResult
                              : never;

export interface JobWorkflow {
  execute<TCommand extends JobCommand>(
    command: TCommand,
    context: ActorContext,
  ): Promise<JobCommandResultFor<TCommand>>;
}
