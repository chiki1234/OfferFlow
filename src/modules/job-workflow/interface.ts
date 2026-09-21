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
  department?: string | null;
  preferenceRank?: number | null;
  jobDescription: JobDescriptionInput;
  jobUrl?: string;
};

export type UpdateJobTrackContextCommand = {
  type: "update_job_track_context";
  lifecycle?: "planned" | "active";
  submittedAt?: string;
  resumeId?: string;
  idempotencyKey: string;
  jobTrackId: string;
  version: number;
  companyName: string;
  roleName: string;
  department?: string | null;
  preferenceRank?: number | null;
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

export type ScheduledTiming =
  | { type: "deadline"; deadlineAt: string }
  | { type: "fixed_slot"; startAt: string; endAt: string };

export type AssessmentTiming = ScheduledTiming;
export type InterviewTiming = ScheduledTiming;

export type RecordAssessmentInviteCommand = {
  type: "record_assessment_invite";
  idempotencyKey: string;
  jobTrackId: string;
  assessmentKind: "assessment" | "written_test";
  assessmentUrl?: string | null;
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

export type CancelAssessmentCommand = {
  type: "cancel_assessment";
  idempotencyKey: string;
  assessmentId: string;
  cancelledAt: string;
};

export type DeleteAssessmentCommand = {
  type: "delete_assessment";
  idempotencyKey: string;
  assessmentId: string;
};

export type ScheduleInterviewCommand = {
  type: "schedule_interview";
  idempotencyKey: string;
  jobTrackId: string;
  sequenceNo?: number;
  roundLabel: string;
  interviewType?: string;
  timing: InterviewTiming;
  meetingUrl?: string;
  notes?: string;
  receivedAt: string;
};

export type RescheduleInterviewCommand = {
  type: "reschedule_interview";
  idempotencyKey: string;
  interviewId: string;
  timing: InterviewTiming;
  changedAt: string;
};

export type CancelInterviewCommand = {
  type: "cancel_interview";
  idempotencyKey: string;
  interviewId: string;
  reason?: string;
  cancelledAt: string;
};

export type DeleteInterviewCommand = {
  type: "delete_interview";
  idempotencyKey: string;
  interviewId: string;
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

export type SaveInterviewTranscriptCommand = {
  type: "save_interview_transcript";
  idempotencyKey: string;
  interviewId: string;
  transcriptText?: string;
  transcriptAssetId?: string;
  savedAt: string;
};

export type CreateTaskCommand = {
  type: "create_task";
  idempotencyKey: string;
  jobTrackId?: string;
  interviewId?: string;
  kind: "generic" | "interview_prep";
  title: string;
  deadlineAt?: string;
  startAt?: string;
  endAt?: string;
};

export type UpdateTaskCommand = {
  type: "update_task";
  idempotencyKey: string;
  taskId: string;
  title: string;
  deadlineAt?: string;
  startAt?: string;
  endAt?: string;
  interviewId?: string | null;
};

export type CompleteTaskCommand = {
  type: "complete_task";
  idempotencyKey: string;
  taskId: string;
  completedAt: string;
};

export type CancelTaskCommand = {
  type: "cancel_task";
  idempotencyKey: string;
  taskId: string;
  cancelledAt: string;
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

export type RecordGenericProgressCommand = {
  type: "record_generic_progress";
  idempotencyKey: string;
  jobTrackId: string;
  summary: string;
  occurredAt: string;
};

export type DeleteJobTrackCommand = {
  type: "delete_job_track" | "delete_planned_job_track";
  idempotencyKey: string;
  jobTrackId: string;
};

export type CreateCompanyJobsCommand = {
  type: "create_company_jobs";
  idempotencyKey: string;
  companyName: string;
  entries: Array<Omit<CreateJobTrackCommand, "type" | "companyName" | "idempotencyKey"> & { resumeId?: string }>;
  lifecycle: "planned" | "active";
};
export type UpdateAssessmentCommand = { type: "update_assessment"; idempotencyKey: string; assessmentId: string; title: string; assessmentKind: "assessment" | "written_test"; assessmentUrl?: string | null; timing: AssessmentTiming };
export type DeleteTaskCommand = { type: "delete_task"; idempotencyKey: string; taskId: string };
export type CreateCompanyJobsResult = { outcome: "company_jobs_created"; jobTracks: JobTrackView[] };
export type UpdateAssessmentResult = { outcome: "assessment_updated"; assessment: AssessmentView; task: TaskView | null };
export type DeleteTaskResult = { outcome: "task_deleted"; taskId: string; jobTrackId: string | null };

export type JobCommand =
  | CreateCompanyJobsCommand | UpdateAssessmentCommand | DeleteTaskCommand
  | CreateJobTrackCommand
  | UpdateJobTrackContextCommand
  | SubmitApplicationCommand
  | RecordAssessmentInviteCommand
  | CompleteAssessmentCommand
  | CancelAssessmentCommand
  | DeleteAssessmentCommand
  | ScheduleInterviewCommand
  | RescheduleInterviewCommand
  | CancelInterviewCommand
  | DeleteInterviewCommand
  | ConfirmInterviewOccurredCommand
  | CompleteInterviewReviewCommand
  | SaveInterviewTranscriptCommand
  | CreateTaskCommand
  | UpdateTaskCommand
  | CompleteTaskCommand
  | CancelTaskCommand
  | RecordRejectionCommand
  | EndJobTrackCommand
  | QuickImportJobTracksCommand
  | RecordGenericProgressCommand
  | DeleteJobTrackCommand;

export type JobTrackView = {
  id: string;
  companyName: string;
  roleName: string;
  department?: string | null;
  preferenceRank?: number | null;
  lifecycle: "planned" | "active" | "ended";
  jobUrl: string | null;
  resumeId: string | null;
  submittedAt: string | null;
  createdAt: string;
  version: number;
};

export type JobEventView = {
  id: string;
  kind:
    | "ApplicationCorrected"
    | "ApplicationSubmitted"
    | "AssessmentInvited"
    | "AssessmentCompleted"
    | "AssessmentCancelled"
    | "InterviewInvited"
    | "InterviewRescheduled"
    | "InterviewCancelled"
    | "InterviewOccurred"
    | "InterviewReviewed"
    | "RejectionReceived"
    | "JobTrackEnded"
    | "GenericProgress";
  jobTrackId: string;
  subjectType: "job_track" | "assessment" | "interview" | "task";
  subjectId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type AssessmentView = {
  assessmentUrl?: string | null;
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
  startAt?: string | null;
  endAt?: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type InterviewView = {
  id: string;
  jobTrackId: string;
  sequenceNo: number | null;
  roundLabel: string;
  interviewType: string;
  timing: InterviewTiming;
  meetingUrl: string | null;
  notes: string | null;
  status: "scheduled" | "cancelled";
  cancelledAt: string | null;
  occurredAt: string | null;
  reviewedAt: string | null;
  transcriptText: string | null;
  transcriptAssetId: string | null;
};

export type CreateJobTrackResult = {
  outcome: "created";
  jobTrack: JobTrackView;
};

export type UpdateJobTrackContextResult = { outcome: "context_updated"; jobTrack: JobTrackView };

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

export type CancelAssessmentResult = {
  outcome: "assessment_cancelled";
  assessment: AssessmentView;
  task: TaskView | null;
  event: JobEventView;
};

export type DeleteAssessmentResult = {
  outcome: "assessment_deleted";
  assessmentId: string;
  jobTrackId: string;
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

export type DeleteInterviewResult = {
  outcome: "interview_deleted";
  interviewId: string;
  jobTrackId: string;
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

export type SaveInterviewTranscriptResult = {
  outcome: "transcript_saved";
  interview: InterviewView;
  occurredEvent: JobEventView | null;
};

export type CreateTaskResult = { outcome: "task_created"; task: TaskView };
export type UpdateTaskResult = { outcome: "task_updated"; task: TaskView };
export type CompleteTaskResult = { outcome: "task_completed"; task: TaskView };
export type CancelTaskResult = { outcome: "task_cancelled"; task: TaskView };
export type EndJobTrackResult = { outcome: "job_track_ended"; jobTrack: JobTrackView; event: JobEventView };
export type QuickImportJobTracksResult = { outcome: "job_tracks_imported"; jobTracks: JobTrackView[] };
export type RecordGenericProgressResult = { outcome: "progress_recorded"; event: JobEventView };
export type DeleteJobTrackResult = { outcome: "job_track_deleted"; jobTrackId: string };

export type JobCommandResult =
  | CreateCompanyJobsResult | UpdateAssessmentResult | DeleteTaskResult
  | CreateJobTrackResult
  | UpdateJobTrackContextResult
  | SubmitApplicationResult
  | RecordAssessmentInviteResult
  | CompleteAssessmentResult
  | CancelAssessmentResult
  | DeleteAssessmentResult
  | ScheduleInterviewResult
  | RescheduleInterviewResult
  | CancelInterviewResult
  | DeleteInterviewResult
  | ConfirmInterviewOccurredResult
  | CompleteInterviewReviewResult
  | SaveInterviewTranscriptResult
  | CreateTaskResult
  | UpdateTaskResult
  | CompleteTaskResult
  | CancelTaskResult
  | EndJobTrackResult
  | QuickImportJobTracksResult
  | RecordGenericProgressResult
  | DeleteJobTrackResult;

export type JobCommandResultFor<TCommand extends JobCommand> =
  TCommand extends CreateCompanyJobsCommand ? CreateCompanyJobsResult
  : TCommand extends UpdateAssessmentCommand ? UpdateAssessmentResult
  : TCommand extends DeleteTaskCommand ? DeleteTaskResult
  : TCommand extends CreateJobTrackCommand
    ? CreateJobTrackResult
    : TCommand extends UpdateJobTrackContextCommand
      ? UpdateJobTrackContextResult
    : TCommand extends SubmitApplicationCommand
      ? SubmitApplicationResult
      : TCommand extends RecordAssessmentInviteCommand
        ? RecordAssessmentInviteResult
        : TCommand extends CompleteAssessmentCommand
          ? CompleteAssessmentResult
          : TCommand extends CancelAssessmentCommand
            ? CancelAssessmentResult
          : TCommand extends DeleteAssessmentCommand
            ? DeleteAssessmentResult
          : TCommand extends ScheduleInterviewCommand
            ? ScheduleInterviewResult
            : TCommand extends RescheduleInterviewCommand
              ? RescheduleInterviewResult
              : TCommand extends CancelInterviewCommand
                ? CancelInterviewResult
                : TCommand extends DeleteInterviewCommand
                  ? DeleteInterviewResult
                : TCommand extends ConfirmInterviewOccurredCommand
                  ? ConfirmInterviewOccurredResult
                  : TCommand extends CompleteInterviewReviewCommand
                    ? CompleteInterviewReviewResult
                    : TCommand extends SaveInterviewTranscriptCommand
                      ? SaveInterviewTranscriptResult
                    : TCommand extends CreateTaskCommand
                      ? CreateTaskResult
                      : TCommand extends UpdateTaskCommand
                        ? UpdateTaskResult
                        : TCommand extends CompleteTaskCommand
                          ? CompleteTaskResult
                          : TCommand extends CancelTaskCommand
                            ? CancelTaskResult
                        : TCommand extends RecordRejectionCommand
                          ? EndJobTrackResult
                          : TCommand extends EndJobTrackCommand
                            ? EndJobTrackResult
                            : TCommand extends QuickImportJobTracksCommand
                              ? QuickImportJobTracksResult
                              : TCommand extends RecordGenericProgressCommand
                                ? RecordGenericProgressResult
                                : TCommand extends DeleteJobTrackCommand
                                  ? DeleteJobTrackResult
                                  : never;

export interface JobWorkflow {
  execute<TCommand extends JobCommand>(
    command: TCommand,
    context: ActorContext,
  ): Promise<JobCommandResultFor<TCommand>>;
}
