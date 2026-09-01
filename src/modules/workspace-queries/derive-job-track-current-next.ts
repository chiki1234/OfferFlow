type CurrentNextAssessment = {
  id: string;
  title: string;
  status: "pending" | "completed" | "cancelled";
  timing:
    | { type: "deadline"; deadlineAt: string }
    | { type: "fixed_slot"; startAt: string; endAt: string };
  completedAt: string | null;
  cancelledAt: string | null;
};

type CurrentNextInterview = {
  id: string;
  roundLabel: string;
  interviewType: string;
  startAt: string;
  endAt: string;
  status: "scheduled" | "cancelled";
  occurredAt: string | null;
  reviewedAt: string | null;
};

type CurrentNextTask = {
  id: string;
  interviewId?: string | null;
  kind: "generic" | "interview_prep" | "assessment";
  title: string;
  deadlineAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type JobTrackCurrentNextFacts = {
  lifecycle: "planned" | "active" | "ended";
  submittedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  lastProgressAt: string | null;
  assessments: CurrentNextAssessment[];
  interviews: CurrentNextInterview[];
  tasks: CurrentNextTask[];
};

export type JobTrackCurrentNextView = {
  state: "planned" | "action_required" | "waiting" | "ended";
  title: string;
  detail: string;
  scheduledAt: string | null;
  waitingDays: number | null;
};

type ActionCandidate = {
  title: string;
  detail: string;
  scheduledAt: string | null;
  sortAt: number;
  priority: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveJobTrackCurrentNext(
  facts: JobTrackCurrentNextFacts,
  now: Date,
): JobTrackCurrentNextView {
  if (facts.lifecycle === "planned") {
    return {
      state: "planned",
      title: "等待投递",
      detail: "补齐 JD 与投递简历后，标记为已投递",
      scheduledAt: null,
      waitingDays: null,
    };
  }

  if (facts.lifecycle === "ended") {
    return {
      state: "ended",
      title: endReasonLabel(facts.endReason),
      detail: facts.endedAt ? "该岗位的招聘流程已经结束" : "该岗位已归档",
      scheduledAt: facts.endedAt,
      waitingDays: null,
    };
  }

  const nowMs = now.getTime();
  const candidates: ActionCandidate[] = [
    ...facts.assessments
      .filter((item) => item.status === "pending")
      .map((item) => {
        const scheduledAt = item.timing.type === "deadline"
          ? item.timing.deadlineAt
          : item.timing.startAt;
        const at = timestamp(scheduledAt);
        return {
          title: item.title,
          detail: at < nowMs
            ? item.timing.type === "deadline" ? "已超过截止时间" : "计划时间已过，等待确认结果"
            : item.timing.type === "deadline" ? "等待在截止前完成" : "已安排固定时间",
          scheduledAt,
          sortAt: at,
          priority: at < nowMs && item.timing.type === "deadline" ? 0 : 1,
        };
      }),
    ...facts.interviews
      .filter((item) => item.status === "scheduled" && timestamp(item.startAt) > nowMs)
      .map((item) => ({
        title: `${item.roundLabel} · ${item.interviewType}`,
        detail: "已安排面试",
        scheduledAt: item.startAt,
        sortAt: timestamp(item.startAt),
        priority: 1,
      })),
    ...facts.tasks
      .filter((item) => {
        if (item.kind === "assessment" || item.completedAt || item.cancelledAt) return false;
        if (item.kind !== "interview_prep") return true;
        const interview = facts.interviews.find((candidate) => candidate.id === item.interviewId);
        return Boolean(interview && interview.status === "scheduled" && timestamp(interview.startAt) > nowMs);
      })
      .map((item) => {
        const at = item.deadlineAt ? timestamp(item.deadlineAt) : Number.POSITIVE_INFINITY;
        return {
          title: item.title,
          detail: item.deadlineAt
            ? at < nowMs ? "已超过截止时间" : "等待完成"
            : "待完成 · 无截止时间",
          scheduledAt: item.deadlineAt,
          sortAt: at,
          priority: item.deadlineAt ? (at < nowMs ? 0 : 1) : 2,
        };
      }),
  ].sort((left, right) => left.priority - right.priority || left.sortAt - right.sortAt);

  const next = candidates[0];
  if (next) {
    return {
      state: "action_required",
      title: next.title,
      detail: next.detail,
      scheduledAt: next.scheduledAt,
      waitingDays: null,
    };
  }

  const anchor = facts.lastProgressAt ?? facts.submittedAt;
  const waitingDays = anchor
    ? Math.max(0, Math.floor((nowMs - timestamp(anchor)) / DAY_MS))
    : 0;
  return {
    state: "waiting",
    title: "等待公司下一步",
    detail: `最近进展后已等待 ${waitingDays} 天`,
    scheduledAt: null,
    waitingDays,
  };
}

function endReasonLabel(reason: string | null) {
  return {
    rejected: "已收到拒绝",
    withdrawn: "已主动结束",
    inactive: "流程已失活",
    other: "已结束",
  }[reason ?? ""] ?? "已结束";
}

function timestamp(value: string) {
  return new Date(value).getTime();
}
