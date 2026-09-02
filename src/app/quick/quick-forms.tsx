"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createQuickTaskAction, recordQuickProgressAction, updateQuickTaskAction, type QuickActionState } from "./actions";

type JobOption = { id: string; companyName: string; roleName: string };
type InterviewOption = { id: string; jobTrackId: string; roundLabel: string; interviewType: string };
const initialState: QuickActionState = { error: null, success: null };

export function QuickTaskForm({ jobs, interviews, unboundTasks, token, embedded = false, onSuccess }: { jobs: JobOption[]; interviews: InterviewOption[]; unboundTasks: Array<{ id: string; title: string; deadlineAt: string | null }>; token: string; embedded?: boolean; onSuccess?: () => void }) {
  const [state, action] = useActionState(createQuickTaskAction, initialState);
  const [jobTrackId, setJobTrackId] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const matchingInterviews = interviews.filter((interview) => interview.jobTrackId === jobTrackId);
  useEffect(() => { if (state.success) onSuccess?.(); }, [onSuccess, state.success]);
  return <div className={embedded ? "quick-action-embedded" : "surface-card quick-action-card"}><form action={action} className="create-form"><input type="hidden" name="idempotencyKey" value={token} />{!embedded && <div><p className="eyebrow">行动</p><h2>新增待办</h2></div>}<label>关联岗位（可选）<select name="jobTrackId" value={jobTrackId} onChange={(event) => { setJobTrackId(event.target.value); setInterviewId(""); }}><option value="">通用待办，不绑定岗位</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.companyName} · {job.roleName}</option>)}</select></label>{jobTrackId && <label>进一步绑定面试（可选）<select name="interviewId" value={interviewId} onChange={(event) => setInterviewId(event.target.value)}><option value="">不绑定面试</option>{matchingInterviews.map((interview) => <option key={interview.id} value={interview.id}>{interview.roundLabel} · {interview.interviewType}</option>)}</select></label>}<label>待办内容<input name="title" placeholder="例如：更新个人作品集" required /></label><label>截止时间（可选）<input name="deadlineAt" type="datetime-local" /></label><Feedback state={state} /><Submit label="创建待办" /></form>{!embedded && unboundTasks.length > 0 && <div className="quick-task-list"><strong>未绑定岗位的待办</strong>{unboundTasks.map((task) => <article key={task.id}><div><span>{task.title}</span><small>{task.deadlineAt ? formatDateTime(task.deadlineAt) : "无截止时间"}</small></div><QuickTaskStatusButton taskId={task.id} operation="complete" label="完成" /><QuickTaskStatusButton taskId={task.id} operation="cancel" label="取消" /></article>)}</div>}</div>;
}

export function QuickProgressForm({ jobs, token, currentLocal, embedded = false, onSuccess }: { jobs: JobOption[]; token: string; currentLocal: string; embedded?: boolean; onSuccess?: () => void }) {
  const [state, action] = useActionState(recordQuickProgressAction, initialState);
  const [progressType, setProgressType] = useState<"assessment" | "interview" | "rejection" | "generic" | "end">("assessment");
  const [timingType, setTimingType] = useState<"deadline" | "fixed_slot">("deadline");
  useEffect(() => { if (state.success) onSuccess?.(); }, [onSuccess, state.success]);
  return <form action={action} className={embedded ? "create-form" : "surface-card create-form quick-action-card"}><input type="hidden" name="idempotencyKey" value={token} />{!embedded && <div><p className="eyebrow">招聘事实</p><h2>记录进展</h2></div>}<label>岗位<select name="jobTrackId" required><option value="">选择进行中的岗位</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.companyName} · {job.roleName}</option>)}</select></label><label>进展类型<select name="progressType" value={progressType} onChange={(event) => setProgressType(event.target.value as typeof progressType)}><option value="assessment">收到测评 / 笔试</option><option value="interview">收到面试邀约</option><option value="rejection">收到拒信</option><option value="generic">其他进展</option><option value="end">主动结束</option></select></label>
    {progressType === "assessment" && <><label>类型<select name="assessmentKind"><option value="assessment">测评</option><option value="written_test">笔试</option></select></label><label>标题<input name="title" placeholder="例如：完成在线测评" required /></label><label>时间类型<select name="timingType" value={timingType} onChange={(event) => setTimingType(event.target.value as typeof timingType)}><option value="deadline">Deadline</option><option value="fixed_slot">固定时段</option></select></label>{timingType === "deadline" ? <label>截止时间<input name="deadlineAt" type="datetime-local" required /></label> : <><label>开始<input name="startAt" type="datetime-local" required /></label><label>结束<input name="endAt" type="datetime-local" required /></label></>}<label>收到时间<input name="receivedAt" type="datetime-local" defaultValue={currentLocal} required /></label></>}
    {progressType === "interview" && <><label>轮次<input name="roundLabel" placeholder="一面 / HR 沟通" required /></label><label>方式<input name="interviewType" placeholder="视频面试" required /></label><label>开始<input name="startAt" type="datetime-local" required /></label><label>结束<input name="endAt" type="datetime-local" required /></label><label>收到时间<input name="receivedAt" type="datetime-local" defaultValue={currentLocal} required /></label><label>会议链接（可选）<input name="meetingUrl" type="url" placeholder="https://" /></label><label>备注（可选）<textarea name="notes" rows={3} /></label></>}
    {progressType === "rejection" && <label>备注（可选）<textarea name="notes" rows={4} placeholder="招聘方原文或你的备注" /></label>}
    {progressType === "generic" && <label>进展摘要<textarea name="summary" rows={4} placeholder="例如：招聘方通知流程延后一周" required /></label>}
    {progressType === "end" && <label>结束原因<select name="reason"><option value="withdrawn">主动放弃</option><option value="accepted_elsewhere">已接受其他 Offer</option><option value="position_closed">岗位关闭</option><option value="other">其他</option></select></label>}
    <Feedback state={state} /><Submit disabled={!jobs.length} label="记录进展" />
  </form>;
}

function Feedback({ state }: { state: QuickActionState }) { return <>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</>; }
function Submit({ label, disabled = false }: { label: string; disabled?: boolean }) { const { pending } = useFormStatus(); return <button className="primary-button wide" disabled={pending || disabled} type="submit">{pending ? "保存中…" : label}</button>; }
function QuickTaskStatusButton({ taskId, operation, label }: { taskId: string; operation: "complete" | "cancel"; label: string }) { const [state, action] = useActionState(updateQuickTaskAction, initialState); return <form action={action} className="inline-action-form"><input type="hidden" name="idempotencyKey" value={`${taskId}:${operation}`} /><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="operation" value={operation} /><button type="submit">{label}</button>{state.error && <small>{state.error}</small>}</form>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
