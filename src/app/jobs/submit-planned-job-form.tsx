"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { jobDetailAction, type JobDetailActionState } from "./[id]/actions";

const initialState: JobDetailActionState = { error: null, success: null };

export function SubmitPlannedJobForm({
  jobTrackId,
  resumes,
  token,
  currentLocal,
}: {
  jobTrackId: string;
  resumes: Array<{ id: string; name: string }>;
  token: string;
  currentLocal: string;
}) {
  const [state, action] = useActionState(jobDetailAction, initialState);
  return <form action={action} className="create-form job-list-submit-form">
    <input name="intent" type="hidden" value="submit" />
    <input name="jobTrackId" type="hidden" value={jobTrackId} />
    <input name="idempotencyKey" type="hidden" value={token} />
    <label>实际投递简历<select name="resumeId" required><option value="">选择简历版本</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label>
    <label>投递时间<input name="submittedAt" type="datetime-local" defaultValue={currentLocal} required /></label>
    {!resumes.length && <p className="form-hint">还没有简历版本，请先进入任一岗位详情上传。</p>}
    {state.error && <p className="form-error">{state.error}</p>}
    {state.success && <p className="form-success">{state.success}</p>}
    <SubmitButton disabled={!resumes.length} />
  </form>;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary-button wide" disabled={disabled || pending} type="submit">{pending ? "保存中…" : "确认已投递"}</button>;
}
