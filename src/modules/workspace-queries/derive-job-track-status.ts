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
  timing:
    | { type: "deadline"; deadlineAt: string }
    | { type: "fixed_slot"; startAt: string; endAt: string };
  occurredAt: string | null;
  reviewedAt: string | null;
};

type TaskFact = {
  id: string;
  kind: "generic" | "interview_prep" | "assessment";
  deadlineAt: string | null;
  startAt?: string | null;
  endAt?: string | null;
  completedAt: string | null;
  cancelledAt?: string | null;
  interviewId?: string | null;
};

export type JobTrackFacts = {
  lifecycle: "planned" | "active" | "ended";
  submittedAt: string | null;
  lastProgressAt?: string | null;
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
  waitingThreshold = 5,
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
      interview.status === "scheduled" &&
      !interview.occurredAt &&
      (interview.timing.type === "deadline" || timestamp(interview.timing.startAt) > nowMs),
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
        !interview.occurredAt &&
        timingStart(interview.timing) > nowMs,
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
      (task.endAt ?? task.deadlineAt) != null &&
      timestamp((task.endAt ?? task.deadlineAt)!) < nowMs,
  );
  const hasOverdueInterview = facts.interviews.some(
    (interview) =>
      interview.status === "scheduled" &&
      !interview.occurredAt &&
      interview.timing.type === "deadline" &&
      timestamp(interview.timing.deadlineAt) < nowMs,
  );
  if (hasOverdueAssessment || hasOverdueInterview || hasOverdueTask) {
    attentionFlags.push("overdue");
  }

  if (actionState === "waiting") {
    const days = jobWaitingDays(facts, now);
    if (days !== null && days >= waitingThreshold) attentionFlags.push("waiting_long");
  }

  const reviewDueInterviewIds = facts.interviews
    .filter(
      (interview) =>
        interview.status === "scheduled" &&
        timingEnd(interview.timing) <= nowMs &&
        (interview.timing.type === "fixed_slot" || interview.occurredAt !== null) &&
        interview.reviewedAt === null,
    )
    .map((interview) => interview.id);

  return { actionState, attentionFlags, reviewDueInterviewIds };
}

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function timingStart(timing: InterviewFact["timing"]): number {
  return timestamp(timingStartIso(timing));
}

function timingStartIso(timing: InterviewFact["timing"]): string {
  return timing.type === "deadline" ? timing.deadlineAt : timing.startAt;
}

function timingEnd(timing: InterviewFact["timing"]): number {
  return timestamp(timing.type === "deadline" ? timing.deadlineAt : timing.endAt);
}

export function jobWaitingDays(facts: JobTrackFacts, now: Date): number | null {
  if (facts.lifecycle !== "active") return null;
  const nowMs = now.getTime();
    const anchors = [
      ...facts.interviews
        .filter(
          (interview) =>
            interview.status === "scheduled" && timingStart(interview.timing) <= nowMs,
        )
        .map((interview) => ({
          type: "interview" as const,
          at: timestamp(interview.occurredAt ?? timingStartIso(interview.timing)),
        })),
      ...facts.assessments
        .filter((assessment) => assessment.completedAt !== null)
        .map((assessment) => ({
          type: "assessment" as const,
          at: timestamp(assessment.completedAt as string),
        })),
    ].sort((left, right) => right.at - left.at);
    const latestAt = Math.max(anchors[0]?.at ?? 0, facts.lastProgressAt ? timestamp(facts.lastProgressAt) : 0, facts.submittedAt ? timestamp(facts.submittedAt) : 0);

  return latestAt ? Math.max(0, Math.floor((nowMs - latestAt) / DAY_IN_MS)) : null;
}
