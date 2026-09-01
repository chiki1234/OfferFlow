"use client";

import { useActionState } from "react";
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
  tokens: { submit: string; assessment: string; interview: string; resume: string; task: string; rejection: string; end: string };
}) {
  if (lifecycle === "ended") return <p className="detail-note">该求职推进已结束，历史记录仍会保留。</p>;
  if (lifecycle === "planned") {
    return <div className="detail-action-stack">
      <ActionForm intent="upload_resume" jobTrackId={jobTrackId} token={tokens.resume} title="上传简历版本">
        <label>版本名称（可选）<input name="resumeName" placeholder="例如：AI 产品经理 V3" /></label>
        <label>简历文件<input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" name="resumeFile" type="file" required /></label>
        <p className="form-hint">支持 PDF 或 DOCX，最大 10MB。</p>
      </ActionForm>
      <ActionForm disabled={!resumes.length} intent="submit" jobTrackId={jobTrackId} token={tokens.submit} title="记录已投递">
        {resumes.length ? <><label>投递简历<select name="resumeId" required>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label><label>投递时间<input name="submittedAt" type="datetime-local" required /></label></> : <p className="form-hint">先上传一个简历版本，再记录投递。</p>}
      </ActionForm>
    </div>;
  }
  return <div className="detail-action-stack">
    <ActionForm intent="assessment" jobTrackId={jobTrackId} token={tokens.assessment} title="记录测评 / 笔试">
      <label>类型<select name="assessmentKind"><option value="assessment">测评</option><option value="written_test">笔试</option></select></label>
      <label>标题<input name="title" placeholder="例如：完成在线测评" required /></label>
      <label>截止时间<input name="deadlineAt" type="datetime-local" required /></label>
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
    <ActionForm intent="record_rejection" jobTrackId={jobTrackId} token={tokens.rejection} title="记录拒信">
      <label>备注（可选）<textarea name="notes" rows={3} placeholder="招聘方的原文或你的备注" /></label>
    </ActionForm>
    <ActionForm intent="end_job_track" jobTrackId={jobTrackId} token={tokens.end} title="主动结束">
      <label>原因<select name="reason"><option value="withdrawn">主动放弃</option><option value="accepted_elsewhere">已接受其他 Offer</option><option value="position_closed">岗位关闭</option><option value="other">其他</option></select></label>
    </ActionForm>
  </div>;
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

export function StatusActionButton({ intent, jobTrackId, subjectId, token, label }: { intent: "complete_task" | "complete_assessment" | "cancel_interview" | "complete_interview_review"; jobTrackId: string; subjectId: string; token: string; label: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="inline-action-form">
    <input type="hidden" name="intent" value={intent} /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="idempotencyKey" value={token} />
    <input type="hidden" name={intent === "complete_task" ? "taskId" : intent === "complete_assessment" ? "assessmentId" : "interviewId"} value={subjectId} />
    <button type="submit">{label}</button>{state.error && <small>{state.error}</small>}
  </form>;
}

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary-button wide" disabled={pending || disabled} type="submit">{pending ? "保存中…" : "保存"}</button>;
}
