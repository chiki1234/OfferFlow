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

export type JobCommand =
  | CreateJobTrackCommand
  | SubmitApplicationCommand
  | RecordAssessmentInviteCommand;

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
  kind: "ApplicationSubmitted" | "AssessmentInvited";
  jobTrackId: string;
  subjectType: "job_track" | "assessment" | "interview" | "task";
  subjectId: string;
  occurredAt: string;
};

export type AssessmentView = {
  id: string;
  jobTrackId: string;
  kind: "assessment" | "written_test";
  title: string;
  timing: AssessmentTiming;
  status: "pending" | "completed" | "cancelled";
};

export type TaskView = {
  id: string;
  jobTrackId: string | null;
  assessmentId: string | null;
  kind: "generic" | "interview_prep" | "assessment";
  title: string;
  deadlineAt: string | null;
  completedAt: string | null;
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

export type JobCommandResult =
  | CreateJobTrackResult
  | SubmitApplicationResult
  | RecordAssessmentInviteResult;

export type JobCommandResultFor<TCommand extends JobCommand> =
  TCommand extends CreateJobTrackCommand
    ? CreateJobTrackResult
    : TCommand extends SubmitApplicationCommand
      ? SubmitApplicationResult
      : TCommand extends RecordAssessmentInviteCommand
        ? RecordAssessmentInviteResult
        : never;

export interface JobWorkflow {
  execute<TCommand extends JobCommand>(
    command: TCommand,
    context: ActorContext,
  ): Promise<JobCommandResultFor<TCommand>>;
}
