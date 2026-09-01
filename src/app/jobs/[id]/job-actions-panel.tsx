"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { jobDetailAction, type JobDetailActionState } from "./actions";

const initialState: JobDetailActionState = { error: null, success: null };

export function JobActionsPanel({
  jobTrackId,
  lifecycle,
  resumes,
  tokens,
}: {
  jobTrackId: string;
  lifecycle: "planned" | "active" | "ended";
  resumes: Array<{ id: string; name: string }>;
  tokens: { submit: string; assessment: string; interview: string; resume: string; jdImages: string; task: string; rejection: string; end: string; progress: string; delete: string };
}) {
  const [assessmentTiming, setAssessmentTiming] = useState<"deadline" | "fixed_slot">("deadline");
  if (lifecycle === "ended") return <p className="detail-note">该求职推进已结束，历史记录仍会保留。</p>;
  if (lifecycle === "planned") {
    return <div className="detail-action-stack">
      <ActionForm intent="upload_resume" jobTrackId={jobTrackId} token={tokens.resume} title="上传简历版本">
        <label>版本名称（可选）<input name="resumeName" placeholder="例如：AI 产品经理 V3" /></label>
        <label>简历文件<input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" name="resumeFile" type="file" required /></label>
        <p className="form-hint">支持 PDF 或 DOCX，最大 10MB。</p>
      </ActionForm>
      <JobDescriptionImageForm jobTrackId={jobTrackId} token={tokens.jdImages} />
      <ActionForm disabled={!resumes.length} intent="submit" jobTrackId={jobTrackId} token={tokens.submit} title="记录已投递">
        {resumes.length ? <><label>投递简历<select name="resumeId" required>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label><label>投递时间<input name="submittedAt" type="datetime-local" required /></label></> : <p className="form-hint">先上传一个简历版本，再记录投递。</p>}
      </ActionForm>
      <ActionForm intent="delete_planned_job_track" jobTrackId={jobTrackId} token={tokens.delete} title="删除未投递岗位"><p className="form-hint">只有尚未投递的岗位可以删除。</p></ActionForm>
    </div>;
  }
  return <div className="detail-action-stack">
    <JobDescriptionImageForm jobTrackId={jobTrackId} token={tokens.jdImages} />
    <ActionForm intent="assessment" jobTrackId={jobTrackId} token={tokens.assessment} title="记录测评 / 笔试">
      <label>类型<select name="assessmentKind"><option value="assessment">测评</option><option value="written_test">笔试</option></select></label>
      <label>标题<input name="title" placeholder="例如：完成在线测评" required /></label>
      <label>时间类型<select name="timingType" value={assessmentTiming} onChange={(event) => setAssessmentTiming(event.target.value as "deadline" | "fixed_slot")}><option value="deadline">Deadline</option><option value="fixed_slot">固定时段</option></select></label>
      {assessmentTiming === "deadline" ? <label>截止时间<input name="deadlineAt" type="datetime-local" required /></label> : <><label>开始<input name="startAt" type="datetime-local" required /></label><label>结束<input name="endAt" type="datetime-local" required /></label></>}
      <label>收到邀请时间<input name="receivedAt" type="datetime-local" required /></label>
    </ActionForm>
    <ActionForm intent="interview" jobTrackId={jobTrackId} token={tokens.interview} title="安排面试">
      <label>轮次<input name="roundLabel" placeholder="一面 / HR 沟通" required /></label>
      <label>方式<input name="interviewType" placeholder="视频面试" required /></label>
      <label>开始<input name="startAt" type="datetime-local" required /></label>
      <label>结束<input name="endAt" type="datetime-local" required /></label>
      <label>收到邀请时间<input name="receivedAt" type="datetime-local" required /></label>
      <label>会议链接（可选）<input name="meetingUrl" type="url" placeholder="https://" /></label>
    </ActionForm>
    <ActionForm intent="task" jobTrackId={jobTrackId} token={tokens.task} title="新增待办">
      <label>待办内容<input name="title" placeholder="例如：整理一面准备提纲" required /></label>
      <label>截止时间<input name="deadlineAt" type="datetime-local" required /></label>
    </ActionForm>
    <ActionForm intent="record_generic_progress" jobTrackId={jobTrackId} token={tokens.progress} title="记录其他进展">
      <label>进展摘要<textarea name="summary" rows={3} placeholder="例如：招聘方通知流程延后一周" required /></label>
    </ActionForm>
    <ActionForm intent="record_rejection" jobTrackId={jobTrackId} token={tokens.rejection} title="记录拒信">
      <label>备注（可选）<textarea name="notes" rows={3} placeholder="招聘方的原文或你的备注" /></label>
    </ActionForm>
    <ActionForm intent="end_job_track" jobTrackId={jobTrackId} token={tokens.end} title="主动结束">
      <label>原因<select name="reason"><option value="withdrawn">主动放弃</option><option value="accepted_elsewhere">已接受其他 Offer</option><option value="position_closed">岗位关闭</option><option value="other">其他</option></select></label>
    </ActionForm>
  </div>;
}

function JobDescriptionImageForm({ jobTrackId, token }: { jobTrackId: string; token: string }) {
  return <ActionForm intent="upload_jd_images" jobTrackId={jobTrackId} token={token} title="补充 JD 截图"><label>JD 图片<input accept="image/jpeg,image/png,image/webp" name="jdImages" type="file" multiple required /></label><p className="form-hint">支持 JPEG、PNG、WebP，一次最多 4 张，每张最大 5MB。</p></ActionForm>;
}

function ActionForm({ intent, jobTrackId, token, title, children, disabled = false }: { intent: string; jobTrackId: string; token: string; title: string; children: React.ReactNode; disabled?: boolean }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form detail-action-form">
    <input type="hidden" name="intent" value={intent} /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="idempotencyKey" value={token} />
    <h3>{title}</h3>{children}
    {state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}
    <SubmitButton disabled={disabled} />
  </form>;
}

export function StatusActionButton({ intent, jobTrackId, subjectId, token, label }: { intent: "complete_task" | "cancel_task" | "complete_assessment" | "cancel_assessment" | "cancel_interview" | "confirm_interview_occurred" | "complete_interview_review"; jobTrackId: string; subjectId: string; token: string; label: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="inline-action-form">
    <input type="hidden" name="intent" value={intent} /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="idempotencyKey" value={token} />
    <input type="hidden" name={intent === "complete_task" || intent === "cancel_task" ? "taskId" : intent === "complete_assessment" || intent === "cancel_assessment" ? "assessmentId" : "interviewId"} value={subjectId} />
    <button type="submit">{label}</button>{state.error && <small>{state.error}</small>}
  </form>;
}

export function TaskEditor({ jobTrackId, task, interviews, token }: {
  jobTrackId: string;
  task: { id: string; title: string; deadlineAt: string | null; interviewId: string | null };
  interviews: Array<{ id: string; roundLabel: string; interviewType: string }>;
  token: string;
}) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <details className="context-editor"><summary>编辑待办</summary><form action={action} className="create-form compact-form"><input type="hidden" name="intent" value="update_task" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="idempotencyKey" value={token} /><label>待办内容<input name="title" defaultValue={task.title} required /></label><label>截止时间（可选）<input name="deadlineAt" type="datetime-local" defaultValue={task.deadlineAt ? toLocalInput(task.deadlineAt) : ""} /></label><label>关联面试（可选）<select name="interviewId" defaultValue={task.interviewId ?? ""}><option value="">不关联面试</option>{interviews.map((interview) => <option key={interview.id} value={interview.id}>{interview.roundLabel} · {interview.interviewType}</option>)}</select></label>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form></details>;
}

export function InterviewScheduleEditor({ jobTrackId, interviewId, token, startAt, endAt }: { jobTrackId: string; interviewId: string; token: string; startAt: string; endAt: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form knowledge-form"><input type="hidden" name="intent" value="reschedule_interview" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="interviewId" value={interviewId} /><input type="hidden" name="idempotencyKey" value={token} /><h3>面试改期</h3><label>新开始时间<input name="startAt" type="datetime-local" defaultValue={startAt} required /></label><label>新结束时间<input name="endAt" type="datetime-local" defaultValue={endAt} required /></label>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}

export function JobContextEditor({ jobTrack, token }: { jobTrack: { id: string; version: number; companyName: string; roleName: string; jobUrl: string | null; jobDescription: string | null }; token: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <details className="context-editor"><summary>编辑岗位上下文</summary><form action={action} className="create-form"><input type="hidden" name="intent" value="update_context" /><input type="hidden" name="jobTrackId" value={jobTrack.id} /><input type="hidden" name="idempotencyKey" value={token} /><input type="hidden" name="version" value={jobTrack.version} /><label>公司<input name="companyName" defaultValue={jobTrack.companyName} required /></label><label>岗位<input name="roleName" defaultValue={jobTrack.roleName} required /></label><label>JD<textarea name="jobDescription" rows={9} defaultValue={jobTrack.jobDescription ?? ""} /></label><label>岗位链接<input name="jobUrl" type="url" defaultValue={jobTrack.jobUrl ?? ""} /></label>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form></details>;
}

export function InterviewTranscriptForm({ jobTrackId, interviewId, token, transcriptText }: { jobTrackId: string; interviewId: string; token: string; transcriptText: string | null }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form knowledge-form"><input type="hidden" name="intent" value="save_interview_transcript" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="interviewId" value={interviewId} /><input type="hidden" name="idempotencyKey" value={token} /><h3>面试转录</h3><label>文本转录（可选）<textarea name="transcriptText" rows={10} defaultValue={transcriptText ?? ""} placeholder="粘贴面试转录或复盘笔记…" /></label><label>转录文件（可选）<input accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" name="transcriptFile" type="file" /></label><p className="form-hint">文本与文件至少提供一种；文件支持 TXT、PDF、DOCX，最大 10MB。</p>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary-button wide" disabled={pending || disabled} type="submit">{pending ? "保存中…" : "保存"}</button>;
}

function toLocalInput(value: string) {
  const date = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}
