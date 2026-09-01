import type {
  AssessmentView,
  InterviewView,
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
  interviews: Map<string, InterviewView>;
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
    interviews: new Map(),
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
        interviews: new Map(state.interviews),
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
    async updateJobTrackContext(input) {
      const jobTrack = state.jobTracks.get(input.jobTrackId);
      if (!jobTrack || jobTrack.userId !== input.userId) return null;
      if (jobTrack.version !== input.version) return null;
      const updated = {
        ...jobTrack,
        companyName: input.companyName,
        roleName: input.roleName,
        jobUrl: input.jobUrl,
        jobDescription: input.jobDescription,
        version: jobTrack.version + 1,
      };
      state.jobTracks.set(updated.id, updated);
      return updated;
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
    async findAssessmentWithTask(userId, assessmentId) {
      const assessment = state.assessments.get(assessmentId);
      if (!assessment) {
        return null;
      }
      const jobTrack = state.jobTracks.get(assessment.jobTrackId);
      if (!jobTrack || jobTrack.userId !== userId) {
        return null;
      }
      const task = [...state.tasks.values()].find(
        (candidate) => candidate.assessmentId === assessmentId,
      ) ?? null;
      return { assessment, task };
    },
    async completeAssessmentWithTask(input) {
      const assessment = state.assessments.get(input.assessmentId);
      const jobTrack = assessment ? state.jobTracks.get(assessment.jobTrackId) : null;
      if (!assessment || !jobTrack || jobTrack.userId !== input.userId) {
        throw new Error("NOT_FOUND: assessment was not found");
      }
      const completedAssessment: AssessmentView = {
        ...assessment,
        status: "completed",
        completedAt: input.completedAt,
      };
      state.assessments.set(completedAssessment.id, completedAssessment);

      const task = [...state.tasks.values()].find(
        (candidate) => candidate.assessmentId === assessment.id,
      );
      const completedTask = task
        ? { ...task, completedAt: input.completedAt }
        : null;
      if (completedTask) {
        state.tasks.set(completedTask.id, completedTask);
      }
      return { assessment: completedAssessment, task: completedTask };
    },
    async cancelAssessmentWithTask(input) {
      const assessment = state.assessments.get(input.assessmentId);
      const jobTrack = assessment ? state.jobTracks.get(assessment.jobTrackId) : null;
      if (!assessment || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: assessment was not found");
      const cancelledAssessment = { ...assessment, status: "cancelled" as const, cancelledAt: input.cancelledAt };
      state.assessments.set(cancelledAssessment.id, cancelledAssessment);
      const task = [...state.tasks.values()].find((candidate) => candidate.assessmentId === assessment.id);
      const cancelledTask = task ? { ...task, cancelledAt: input.cancelledAt } : null;
      if (cancelledTask) state.tasks.set(cancelledTask.id, cancelledTask);
      return { assessment: cancelledAssessment, task: cancelledTask };
    },
    async insertInterview(interview) {
      state.interviews.set(interview.id, interview);
      return interview;
    },
    async findInterview(userId, interviewId) {
      const interview = state.interviews.get(interviewId);
      const jobTrack = interview ? state.jobTracks.get(interview.jobTrackId) : null;
      return interview && jobTrack?.userId === userId ? interview : null;
    },
    async updateInterviewSchedule(input) {
      const interview = state.interviews.get(input.interviewId);
      const jobTrack = interview ? state.jobTracks.get(interview.jobTrackId) : null;
      if (!interview || jobTrack?.userId !== input.userId) {
        throw new Error("NOT_FOUND: interview was not found");
      }
      const updated = { ...interview, startAt: input.startAt, endAt: input.endAt };
      state.interviews.set(updated.id, updated);
      return updated;
    },
    async cancelInterviewWithPreparationTasks(input) {
      const interview = state.interviews.get(input.interviewId);
      const jobTrack = interview ? state.jobTracks.get(interview.jobTrackId) : null;
      if (!interview || jobTrack?.userId !== input.userId) {
        throw new Error("NOT_FOUND: interview was not found");
      }
      const cancelled = {
        ...interview,
        status: "cancelled" as const,
        cancelledAt: input.cancelledAt,
      };
      state.interviews.set(cancelled.id, cancelled);
      return cancelled;
    },
    async markInterviewOccurred(input) {
      const interview = state.interviews.get(input.interviewId);
      const jobTrack = interview ? state.jobTracks.get(interview.jobTrackId) : null;
      if (!interview || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: interview was not found");
      const occurred = { ...interview, occurredAt: input.occurredAt };
      state.interviews.set(occurred.id, occurred);
      return occurred;
    },
    async completeInterviewReview(input) {
      const interview = state.interviews.get(input.interviewId);
      const jobTrack = interview ? state.jobTracks.get(interview.jobTrackId) : null;
      if (!interview || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: interview was not found");
      const reviewed = { ...interview, occurredAt: input.occurredAt, reviewedAt: input.reviewedAt };
      state.interviews.set(reviewed.id, reviewed);
      return reviewed;
    },
    async saveInterviewTranscript(input) {
      const interview = state.interviews.get(input.interviewId);
      const jobTrack = interview ? state.jobTracks.get(interview.jobTrackId) : null;
      if (!interview || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: interview was not found");
      const saved = { ...interview, occurredAt: input.occurredAt, transcriptText: input.transcriptText };
      state.interviews.set(saved.id, saved);
      return saved;
    },
    async insertTask(input) {
      state.tasks.set(input.task.id, input.task);
      return input.task;
    },
    async findTask(userId, taskId) {
      const task = state.tasks.get(taskId);
      const jobTrack = task?.jobTrackId ? state.jobTracks.get(task.jobTrackId) : null;
      return task && jobTrack?.userId === userId ? task : null;
    },
    async updateTask(input) {
      const task = state.tasks.get(input.taskId);
      const jobTrack = task?.jobTrackId ? state.jobTracks.get(task.jobTrackId) : null;
      if (!task || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: task was not found");
      const updated = { ...task, title: input.title, deadlineAt: input.deadlineAt, interviewId: input.interviewId };
      state.tasks.set(updated.id, updated);
      return updated;
    },
    async completeTask(input) {
      const task = state.tasks.get(input.taskId);
      const jobTrack = task?.jobTrackId ? state.jobTracks.get(task.jobTrackId) : null;
      if (!task || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: task was not found");
      const completed = { ...task, completedAt: input.completedAt };
      state.tasks.set(completed.id, completed);
      return completed;
    },
    async cancelTask(input) {
      const task = state.tasks.get(input.taskId);
      const jobTrack = task?.jobTrackId ? state.jobTracks.get(task.jobTrackId) : null;
      if (!task || jobTrack?.userId !== input.userId) throw new Error("NOT_FOUND: task was not found");
      const cancelled = { ...task, cancelledAt: input.cancelledAt };
      state.tasks.set(cancelled.id, cancelled);
      return cancelled;
    },
    async endJobTrack(input) {
      const jobTrack = state.jobTracks.get(input.jobTrackId);
      if (!jobTrack || jobTrack.userId !== input.userId) throw new Error("NOT_FOUND: job track was not found");
      const ended = { ...jobTrack, lifecycle: "ended" as const };
      state.jobTracks.set(ended.id, ended);
      for (const [id, assessment] of state.assessments) {
        if (assessment.jobTrackId === ended.id && assessment.status === "pending") state.assessments.set(id, { ...assessment, status: "cancelled", cancelledAt: input.endedAt });
      }
      for (const [id, interview] of state.interviews) {
        if (interview.jobTrackId === ended.id && interview.status === "scheduled") state.interviews.set(id, { ...interview, status: "cancelled", cancelledAt: input.endedAt });
      }
      for (const [id, task] of state.tasks) {
        if (task.jobTrackId === ended.id && !task.completedAt && !task.cancelledAt) state.tasks.set(id, { ...task, cancelledAt: input.endedAt });
      }
      return ended;
    },
    async deleteJobTrack(userId, jobTrackId) {
      const jobTrack = state.jobTracks.get(jobTrackId);
      if (!jobTrack || jobTrack.userId !== userId) throw new Error("NOT_FOUND: job track was not found");
      state.jobTracks.delete(jobTrackId);
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
        payload: input.payload,
      };
      state.events.push(event);
      return event;
    },
  };
}
