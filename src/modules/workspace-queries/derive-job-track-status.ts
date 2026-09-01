export type ActionState = "action_required" | "waiting" | null;
export type AttentionFlag = "overdue" | "waiting_long";

type AssessmentFact = {
  id: string;
  status: "pending" | "completed" | "cancelled";
  timing:
    | { type: "deadline"; deadlineAt: string }
    | { type: "fixed_slot"; startAt: string; endAt: string };
  completedAt: string | null;
};

type InterviewFact = {
  id: string;
  status: "scheduled" | "cancelled";
  startAt: string;
  occurredAt: string | null;
  reviewedAt: string | null;
};

type TaskFact = {
  id: string;
  kind: "generic" | "interview_prep" | "assessment";
  deadlineAt: string | null;
  completedAt: string | null;
  cancelledAt?: string | null;
  interviewId?: string | null;
};

export type JobTrackFacts = {
  lifecycle: "planned" | "active" | "ended";
  submittedAt: string | null;
  assessments: AssessmentFact[];
  interviews: InterviewFact[];
  tasks: TaskFact[];
};

export type JobTrackStatusView = {
  actionState: ActionState;
  attentionFlags: AttentionFlag[];
  reviewDueInterviewIds: string[];
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function deriveJobTrackStatus(
  facts: JobTrackFacts,
  now: Date,
): JobTrackStatusView {
  if (facts.lifecycle !== "active") {
    return { actionState: null, attentionFlags: [], reviewDueInterviewIds: [] };
  }

  const nowMs = now.getTime();
  const pendingAssessments = facts.assessments.filter(
    (assessment) => assessment.status === "pending",
  );
  const futureInterviews = facts.interviews.filter(
    (interview) =>
      interview.status === "scheduled" && timestamp(interview.startAt) > nowMs,
  );
  const actionableTasks = facts.tasks.filter((task) => {
    if (task.completedAt || task.cancelledAt || task.kind === "assessment") {
      return false;
    }
    if (task.kind !== "interview_prep") {
      return true;
    }
    const interview = facts.interviews.find((candidate) => candidate.id === task.interviewId);
    return Boolean(
      interview &&
        interview.status === "scheduled" &&
        timestamp(interview.startAt) > nowMs,
    );
  });
  const actionState: ActionState =
    pendingAssessments.length > 0 ||
    futureInterviews.length > 0 ||
    actionableTasks.length > 0
      ? "action_required"
      : "waiting";

  const attentionFlags: AttentionFlag[] = [];
  const hasOverdueAssessment = pendingAssessments.some(
    (assessment) =>
      assessment.timing.type === "deadline" &&
      timestamp(assessment.timing.deadlineAt) < nowMs,
  );
  const hasOverdueTask = facts.tasks.some(
    (task) =>
      !task.completedAt &&
      !task.cancelledAt &&
      task.deadlineAt !== null &&
      timestamp(task.deadlineAt) < nowMs,
  );
  if (hasOverdueAssessment || hasOverdueTask) {
    attentionFlags.push("overdue");
  }

  if (actionState === "waiting") {
    const anchors = [
      ...facts.interviews
        .filter(
          (interview) =>
            interview.status === "scheduled" && timestamp(interview.startAt) <= nowMs,
        )
        .map((interview) => ({
          type: "interview" as const,
          at: timestamp(interview.occurredAt ?? interview.startAt),
        })),
      ...facts.assessments
        .filter((assessment) => assessment.completedAt !== null)
        .map((assessment) => ({
          type: "assessment" as const,
          at: timestamp(assessment.completedAt as string),
        })),
    ].sort((left, right) => right.at - left.at);
    const latest = anchors[0];
    const threshold = latest?.type === "interview" ? 7 * DAY_IN_MS : 14 * DAY_IN_MS;
    if (latest && nowMs - latest.at > threshold) {
      attentionFlags.push("waiting_long");
    }
  }

  const reviewDueInterviewIds = facts.interviews
    .filter(
      (interview) =>
        interview.status === "scheduled" &&
        timestamp(interview.startAt) <= nowMs &&
        interview.reviewedAt === null,
    )
    .map((interview) => interview.id);

  return { actionState, attentionFlags, reviewDueInterviewIds };
}

function timestamp(value: string): number {
  return new Date(value).getTime();
}
