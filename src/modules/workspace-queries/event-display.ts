function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatInterviewTiming(timing: import("@/modules/job-workflow/interface").InterviewTiming) { return timing.type === "deadline" ? `截止 ${formatDateTime(timing.deadlineAt)}` : `${formatDateTime(timing.startAt)} – ${formatTime(timing.endAt)}`; }
export function eventLabel(value: string) { return { ApplicationCorrected: "更正投递信息", ApplicationSubmitted: "已投递", AssessmentInvited: "收到测评邀请", AssessmentCompleted: "完成测评", AssessmentCancelled: "测评取消", InterviewInvited: "收到面试邀请", InterviewRescheduled: "面试改期", InterviewCancelled: "面试取消", InterviewOccurred: "面试已发生", InterviewReviewed: "完成面试复盘", RejectionReceived: "收到拒信", JobTrackEnded: "求职推进已结束", GenericProgress: "其他进展" }[value] ?? value; }
export function eventDetail(kind: string, payload: Record<string, unknown>) {
  if (kind === "ApplicationCorrected") return payload.lifecycle === "planned" ? "已改回待投递，原有招聘进展保留" : `已投递${typeof payload.submittedAt === "string" ? " · " + formatDateTime(payload.submittedAt) : ""}`;
  if (kind === "GenericProgress" && typeof payload.summary === "string") return payload.summary;
  if (kind === "RejectionReceived" && typeof payload.notes === "string") return payload.notes;
  if (kind === "InterviewCancelled" && typeof payload.reason === "string") return `原因：${payload.reason}`;
  if (kind === "JobTrackEnded" && typeof payload.reason === "string") return `原因：${{ withdrawn: "主动结束", inactive: "流程失活", other: "其他" }[payload.reason] ?? payload.reason}`;
  if (kind === "InterviewRescheduled") {
    const previous = eventTiming(payload.previousTiming);
    const next = eventTiming(payload.timing);
    if (previous && next) return `${formatInterviewTiming(previous)} → ${formatInterviewTiming(next)}`;
    if (typeof payload.previousStartAt === "string" && typeof payload.startAt === "string") return `${formatDateTime(payload.previousStartAt)} → ${formatDateTime(payload.startAt)}`;
  }
  return null;
}
function eventTiming(value: unknown): import("@/modules/job-workflow/interface").InterviewTiming | null {
  if (!value || typeof value !== "object") return null;
  const timing = value as Record<string, unknown>;
  if (timing.type === "deadline" && typeof timing.deadlineAt === "string") return { type: "deadline", deadlineAt: timing.deadlineAt };
  if (timing.type === "fixed_slot" && typeof timing.startAt === "string" && typeof timing.endAt === "string") return { type: "fixed_slot", startAt: timing.startAt, endAt: timing.endAt };
  return null;
}
