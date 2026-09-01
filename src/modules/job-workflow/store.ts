import type {
  AssessmentView,
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
