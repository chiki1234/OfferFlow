"use client";
import { DateTimeInput } from "@/components/date-time-input";
import { TaskTimeFields } from "@/components/task-time-fields";
import { AssessmentFields, AssessmentKindField, InterviewFields, ScheduledTimingFields } from "@/components/progress-fields";


import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, ClipboardPlus, Pencil, Send, Trash2 } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import { ResumeSelectionFields, type ExperienceOption, type ResumeOption } from "@/components/resume-selection-fields";
import { jobDetailAction, type JobDetailActionState } from "./actions";
import type { InterviewTiming } from "@/modules/job-workflow/interface";

const initialState: JobDetailActionState = { error: null, success: null };

export function RecordApplicationButton({ jobTrackId, resumes, experiences, token }: { jobTrackId: string; resumes: ResumeOption[]; experiences: ExperienceOption[]; token: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button className="primary-button compact-button" onClick={() => setOpen(true)} type="button"><Send size={16} />记录已投递</button>{open && <OperationModal onClose={close} title="记录已投递"><ModalActionForm intent="submit" jobTrackId={jobTrackId} onSuccess={close} submitLabel="确认已投递" token={token}><ResumeSelectionFields experiences={experiences} resumes={resumes} /><label>投递时间<DateTimeInput defaultValue={toLocalInput(new Date().toISOString())} name="submittedAt"  required /></label></ModalActionForm></OperationModal>}</>;
}

export function AddJobDescriptionImagesButton({ jobTrackId, token }: { jobTrackId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button className="secondary-button compact-button" onClick={() => setOpen(true)} type="button"><Camera size={16} />补充 JD 截图</button>{open && <OperationModal onClose={close} title="补充 JD 截图"><ModalActionForm intent="upload_jd_images" jobTrackId={jobTrackId} onSuccess={close} submitLabel="上传截图" token={token}><label>JD 图片<input accept="image/jpeg,image/png,image/webp" name="jdImages" type="file" multiple required /></label><p className="form-hint">支持 JPEG、PNG、WebP，一次最多 4 张，每张最大 5MB。</p></ModalActionForm></OperationModal>}</>;
}

type ProgressType = "assessment" | "interview" | "task" | "generic" | "rejection" | "end";

export function RecordJobProgressButton({ jobTrackId, token }: { jobTrackId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button className="primary-button compact-button" onClick={() => setOpen(true)} type="button"><ClipboardPlus size={16} />记录进展</button>{open && <OperationModal onClose={close} title="记录进展"><JobProgressForm jobTrackId={jobTrackId} onSuccess={close} token={token} /></OperationModal>}</>;
}

function JobProgressForm({ jobTrackId, token, onSuccess }: { jobTrackId: string; token: string; onSuccess: () => void }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  const [progressType, setProgressType] = useState<ProgressType>("assessment");
  const currentLocal = toLocalInput(new Date().toISOString());
  useEffect(() => { if (state.success) onSuccess(); }, [onSuccess, state.success]);
  const intent = { assessment: "assessment", interview: "interview", task: "task", generic: "record_generic_progress", rejection: "record_rejection", end: "end_job_track" }[progressType];
  return <form action={action} className="create-form"><input name="intent" type="hidden" value={intent} /><input name="jobTrackId" type="hidden" value={jobTrackId} /><input name="idempotencyKey" type="hidden" value={token} /><div className="form-row"><label>进展类型<select name="progressType" value={progressType} onChange={(event) => setProgressType(event.target.value as ProgressType)}><option value="assessment">记录测评 / 笔试</option><option value="interview">安排面试</option><option value="task">新增待办</option><option value="generic">记录其他进展</option><option value="rejection">收到拒信</option><option value="end">主动结束</option></select></label>{progressType === "assessment" && <AssessmentKindField />}</div>
    {progressType === "assessment" && <><AssessmentFields /><label>收到时间<DateTimeInput name="receivedAt"  defaultValue={currentLocal} required /></label></>}
    {progressType === "interview" && <><InterviewFields /><label>收到时间<DateTimeInput name="receivedAt"  defaultValue={currentLocal} required /></label></>}
    {progressType === "task" && <><label>待办内容<input name="title" placeholder="例如：整理一面准备提纲" required /></label><TaskTimeFields /></>}
    {progressType === "generic" && <label>进展摘要<textarea name="summary" placeholder="例如：招聘方通知流程延后一周" rows={4} required /></label>}
    {progressType === "rejection" && <label>备注（可选）<textarea name="notes" placeholder="招聘方原文或你的备注" rows={4} /></label>}
    {progressType === "end" && <label>结束原因<select name="reason"><option value="withdrawn">主动放弃</option><option value="accepted_elsewhere">已接受其他 Offer</option><option value="position_closed">岗位关闭</option><option value="other">其他</option></select></label>}
    {state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}

function ModalActionForm({ intent, jobTrackId, token, children, onSuccess, submitLabel }: { intent: string; jobTrackId: string; token: string; children: React.ReactNode; onSuccess: () => void; submitLabel: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  useEffect(() => { if (state.success) onSuccess(); }, [onSuccess, state.success]);
  return <form action={action} className="create-form"><input name="intent" type="hidden" value={intent} /><input name="jobTrackId" type="hidden" value={jobTrackId} /><input name="idempotencyKey" type="hidden" value={token} />{children}{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<ModalSubmitButton label={submitLabel} /></form>;
}

function ModalSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="primary-button wide" disabled={pending} type="submit">{pending ? "保存中…" : label}</button>;
}

export function StatusActionButton({ intent, jobTrackId, subjectId, token, label }: { intent: "complete_task" | "cancel_task" | "complete_assessment" | "cancel_assessment" | "cancel_interview" | "confirm_interview_occurred" | "complete_interview_review"; jobTrackId: string; subjectId: string; token: string; label: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="inline-action-form">
    <input type="hidden" name="intent" value={intent} /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="idempotencyKey" value={token} />
    <input type="hidden" name={intent === "complete_task" || intent === "cancel_task" ? "taskId" : intent === "complete_assessment" || intent === "cancel_assessment" ? "assessmentId" : "interviewId"} value={subjectId} />
    <button type="submit">{label}</button>{state.error && <small>{state.error}</small>}
  </form>;
}

export function DeleteRecordButton({ jobTrackId, kind, subjectId, title, token }: { jobTrackId: string; kind: "assessment" | "interview" | "task"; subjectId: string; title: string; token: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [state, action] = useActionState(jobDetailAction, initialState);
  const typeLabel = kind === "assessment" ? "测评 / 笔试" : kind === "task" ? "待办" : "面试";
  return <>
    <button className="danger-text-button record-delete-trigger" onClick={() => setOpen(true)} type="button"><Trash2 size={14} />删除</button>
    {open && <OperationModal description={`“${title}”删除后无法恢复。`} onClose={close} title={`删除${typeLabel}`}>
      <form action={action} className="create-form delete-record-form">
        <input name="intent" type="hidden" value={kind === "assessment" ? "delete_assessment" : kind === "task" ? "delete_task" : "delete_interview"} />
        <input name="jobTrackId" type="hidden" value={jobTrackId} />
        <input name="idempotencyKey" type="hidden" value={token} />
        <input name={kind === "assessment" ? "assessmentId" : kind === "task" ? "taskId" : "interviewId"} type="hidden" value={subjectId} />
        <p>将彻底删除这条记录、关联待办、时间线事实以及其他关联内容。</p>
        {state.error && <p className="form-error">{state.error}</p>}
        <div className="modal-footer-actions">
          <button className="secondary-button" onClick={close} type="button">保留记录</button>
          <DeleteSubmitButton />
        </div>
      </form>
    </OperationModal>}
  </>;
}

export function TaskEditor({ jobTrackId, task, interviews, token }: {
  jobTrackId: string;
  task: { id: string; title: string; deadlineAt: string | null; startAt?: string | null; endAt?: string | null; interviewId: string | null };
  interviews: Array<{ id: string; roundLabel: string; interviewType: string }>;
  token: string;
}) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <details className="context-editor"><summary>编辑待办</summary><form action={action} className="create-form compact-form"><input type="hidden" name="intent" value="update_task" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="idempotencyKey" value={token} /><label>待办内容<input name="title" defaultValue={task.title} required /></label><TaskTimeFields task={task} /><label>关联面试（可选）<select name="interviewId" defaultValue={task.interviewId ?? ""}><option value="">不关联面试</option>{interviews.map((interview) => <option key={interview.id} value={interview.id}>{interview.roundLabel} · {interview.interviewType}</option>)}</select></label>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form></details>;
}

export function InterviewPrepTaskForm({ jobTrackId, interviewId, token }: { jobTrackId: string; interviewId: string; token: string }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form knowledge-form"><input type="hidden" name="intent" value="task" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="interviewId" value={interviewId} /><input type="hidden" name="idempotencyKey" value={token} /><h3>新增面试准备待办</h3><label>待办内容<input name="title" placeholder="例如：准备项目追问清单" required /></label><TaskTimeFields />{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}

export function InterviewScheduleEditor({ jobTrackId, interviewId, token, timing }: { jobTrackId: string; interviewId: string; token: string; timing: InterviewTiming }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form knowledge-form"><input type="hidden" name="intent" value="reschedule_interview" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="interviewId" value={interviewId} /><input type="hidden" name="idempotencyKey" value={token} /><h3>修改面试时间</h3><ScheduledTimingFields timing={timing} defaultType="fixed_slot" />{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}

export function JobContextEditor({ jobTrack, token }: { jobTrack: { id: string; version: number; companyName: string; roleName: string; preferenceRank?: number | null; jobUrl: string | null; jobDescription: string | null }; token: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button className="secondary-button compact-button" onClick={() => setOpen(true)} type="button"><Pencil size={15} />编辑</button>
    {open && <OperationModal onClose={close} title="编辑岗位信息与 JD">
      <ModalActionForm intent="update_context" jobTrackId={jobTrack.id} onSuccess={close} submitLabel="保存修改" token={token}>
        <input name="version" type="hidden" value={jobTrack.version} />
        <label>公司<input defaultValue={jobTrack.companyName} name="companyName" required /></label>
        <label>岗位<input defaultValue={jobTrack.roleName} name="roleName" required /></label><label>志愿（可选）<input name="preferenceRank" type="number" min="1" step="1" defaultValue={jobTrack.preferenceRank ?? ""} /></label>
        <label>JD<textarea defaultValue={jobTrack.jobDescription ?? ""} name="jobDescription" rows={9} /></label>
        <label>岗位链接<input defaultValue={jobTrack.jobUrl ?? ""} name="jobUrl" type="url" /></label>
      </ModalActionForm>
    </OperationModal>}
  </>;
}

export function InterviewTranscriptForm({ jobTrackId, interviewId, token, transcriptText }: { jobTrackId: string; interviewId: string; token: string; transcriptText: string | null }) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form knowledge-form"><input type="hidden" name="intent" value="save_interview_transcript" /><input type="hidden" name="jobTrackId" value={jobTrackId} /><input type="hidden" name="interviewId" value={interviewId} /><input type="hidden" name="idempotencyKey" value={token} /><h3>面试转录</h3><label>文本转录（可选）<textarea name="transcriptText" rows={10} defaultValue={transcriptText ?? ""} placeholder="粘贴面试转录或复盘笔记…" /></label><label>转录文件（可选）<input accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" name="transcriptFile" type="file" /></label><p className="form-hint">文本与文件至少提供一种；文件支持 TXT、PDF、DOCX，最大 10MB。</p>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary-button wide" disabled={pending || disabled} type="submit">{pending ? "保存中…" : "保存"}</button>;
}

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="danger-button" disabled={pending} type="submit">{pending ? "删除中…" : "确认彻底删除"}</button>;
}

function toLocalInput(value: string) {
  const date = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

export function AssessmentEditor({ jobTrackId, assessment }: { jobTrackId: string; assessment: import("@/modules/job-workflow/interface").AssessmentView }) {
 const [state, action] = useActionState(jobDetailAction, { error: null, success: null });
 const [token] = useState(() => globalThis.crypto.randomUUID());
 return <form action={action} className="create-form"><input name="intent" type="hidden" value="update_assessment" /><input name="idempotencyKey" type="hidden" value={token} /><input name="jobTrackId" type="hidden" value={jobTrackId} /><input name="assessmentId" type="hidden" value={assessment.id} /><AssessmentKindField value={assessment.kind} /><AssessmentFields assessment={assessment} />{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<SubmitButton /></form>;
}
