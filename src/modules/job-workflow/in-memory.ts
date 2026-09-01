import type {
  AssessmentView,
  JobCommandResult,
  JobEventView,
  TaskView,
} from "./interface";
import { createJobWorkflow } from "./implementation";
import type {
  JobWorkflowStore,
  JobWorkflowTransaction,
  StoredJobTrack,
  StoredResume,
} from "./store";

type InMemoryJobWorkflowOptions = {
  resumes?: StoredResume[];
};

type MemoryState = {
  jobTracks: Map<string, StoredJobTrack>;
  resumes: Map<string, StoredResume>;
  receipts: Map<string, JobCommandResult>;
  events: JobEventView[];
  assessments: Map<string, AssessmentView>;
  tasks: Map<string, TaskView>;
};

export function createInMemoryJobWorkflow(options: InMemoryJobWorkflowOptions = {}) {
  return createJobWorkflow({
    store: createInMemoryJobWorkflowStore(options),
  });
}

function createInMemoryJobWorkflowStore(
  options: InMemoryJobWorkflowOptions,
): JobWorkflowStore {
  let state: MemoryState = {
    jobTracks: new Map(),
    resumes: new Map(options.resumes?.map((resume) => [resume.id, resume]) ?? []),
    receipts: new Map(),
    events: [],
    assessments: new Map(),
    tasks: new Map(),
  };

  return {
    async transaction<T>(work: (transaction: JobWorkflowTransaction) => Promise<T>): Promise<T> {
      const working: MemoryState = {
        jobTracks: new Map(state.jobTracks),
        resumes: new Map(state.resumes),
        receipts: new Map(state.receipts),
        events: [...state.events],
        assessments: new Map(state.assessments),
        tasks: new Map(state.tasks),
      };
      const result = await work(createMemoryTransaction(working));
      state = working;
      return result;
    },
  };
}

function createMemoryTransaction(state: MemoryState): JobWorkflowTransaction {
  return {
    async findReceipt(userId, idempotencyKey) {
      return state.receipts.get(`${userId}:${idempotencyKey}`) ?? null;
    },
    async saveReceipt(input) {
      state.receipts.set(`${input.userId}:${input.idempotencyKey}`, input.result);
    },
    async insertJobTrack(jobTrack) {
      state.jobTracks.set(jobTrack.id, jobTrack);
      return jobTrack;
    },
    async findJobTrack(userId, jobTrackId) {
      const jobTrack = state.jobTracks.get(jobTrackId);
      return jobTrack?.userId === userId ? jobTrack : null;
    },
    async findResume(userId, resumeId) {
      const resume = state.resumes.get(resumeId);
      return resume?.userId === userId ? resume : null;
    },
    async insertAssessmentWithTask(input) {
      state.assessments.set(input.assessment.id, input.assessment);
      if (input.task) {
        state.tasks.set(input.task.id, input.task);
      }
      return input;
    },
    async markApplicationSubmitted(input) {
      const jobTrack = state.jobTracks.get(input.jobTrackId);
      if (!jobTrack || jobTrack.userId !== input.userId) {
        throw new Error("NOT_FOUND: job track was not found");
      }
      const updated: StoredJobTrack = {
        ...jobTrack,
        lifecycle: "active",
        resumeId: input.resumeId,
        submittedAt: input.submittedAt,
      };
      state.jobTracks.set(updated.id, updated);
      return updated;
    },
    async insertEvent(input) {
      const event: JobEventView = {
        id: input.id,
        kind: input.kind,
        jobTrackId: input.jobTrackId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
      };
      state.events.push(event);
      return event;
    },
  };
}
