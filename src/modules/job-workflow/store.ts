import type {
  AssessmentView,
  InterviewView,
  JobCommandResult,
  JobEventView,
  TaskView,
} from "./interface";

export type StoredJobTrack = {
  id: string;
  userId: string;
  companyName: string;
  roleName: string;
  lifecycle: "planned" | "active" | "ended";
  jobUrl: string | null;
  resumeId: string | null;
  submittedAt: string | null;
  createdAt: string;
  createdVia: "normal" | "quick_import";
  jobDescription: {
    text: string | null;
    imageAssetIds: string[];
  };
};

export type StoredResume = {
  id: string;
  userId: string;
};

export interface JobWorkflowTransaction {
  findReceipt(userId: string, idempotencyKey: string): Promise<JobCommandResult | null>;
  saveReceipt(input: {
    userId: string;
    idempotencyKey: string;
    commandType: string;
    result: JobCommandResult;
  }): Promise<void>;
  insertJobTrack(jobTrack: StoredJobTrack): Promise<StoredJobTrack>;
  findJobTrack(userId: string, jobTrackId: string): Promise<StoredJobTrack | null>;
  findResume(userId: string, resumeId: string): Promise<StoredResume | null>;
  insertAssessmentWithTask(input: {
    userId: string;
    assessment: AssessmentView;
    task: TaskView | null;
  }): Promise<{ assessment: AssessmentView; task: TaskView | null }>;
  findAssessmentWithTask(
    userId: string,
    assessmentId: string,
  ): Promise<{ assessment: AssessmentView; task: TaskView | null } | null>;
  completeAssessmentWithTask(input: {
    userId: string;
    assessmentId: string;
    completedAt: string;
  }): Promise<{ assessment: AssessmentView; task: TaskView | null }>;
  insertInterview(interview: InterviewView): Promise<InterviewView>;
  findInterview(userId: string, interviewId: string): Promise<InterviewView | null>;
  updateInterviewSchedule(input: {
    userId: string;
    interviewId: string;
    startAt: string;
    endAt: string;
  }): Promise<InterviewView>;
  cancelInterviewWithPreparationTasks(input: {
    userId: string;
    interviewId: string;
    cancelledAt: string;
  }): Promise<InterviewView>;
  markInterviewOccurred(input: {
    userId: string;
    interviewId: string;
    occurredAt: string;
  }): Promise<InterviewView>;
  completeInterviewReview(input: {
    userId: string;
    interviewId: string;
    occurredAt: string;
    reviewedAt: string;
  }): Promise<InterviewView>;
  insertTask(input: { userId: string; task: TaskView }): Promise<TaskView>;
  findTask(userId: string, taskId: string): Promise<TaskView | null>;
  completeTask(input: { userId: string; taskId: string; completedAt: string }): Promise<TaskView>;
  endJobTrack(input: {
    userId: string;
    jobTrackId: string;
    endedAt: string;
    endReason: string;
  }): Promise<StoredJobTrack>;
  markApplicationSubmitted(input: {
    userId: string;
    jobTrackId: string;
    resumeId: string;
    submittedAt: string;
  }): Promise<StoredJobTrack>;
  insertEvent(input: JobEventView & { userId: string; actionId: string }): Promise<JobEventView>;
}

export interface JobWorkflowStore {
  transaction<T>(work: (transaction: JobWorkflowTransaction) => Promise<T>): Promise<T>;
}
