"use client";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import { DateTimeInput } from "@/components/date-time-input";
import { ResumeSelectionFields } from "@/components/resume-selection-fields";
import { loadJobEditorAction, saveJobEditorAction } from "./edit-actions";

export function EditJobButton({ jobTrackId }: { jobTrackId: string }) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadJobEditorAction>> | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <>
    <button type="button" className="secondary-button compact-button" onClick={() => { setOpen(true); setData(null); setError(""); start(async () => { try { setData(await loadJobEditorAction(jobTrackId)); } catch { setError("加载失败，请关闭后重试。"); } }); }}><Pencil size={14} />编辑</button>
    {open && <OperationModal title="编辑岗位" onClose={() => { if (!pending && !saving) setOpen(false); }}>{data ? <Editor data={data} onSaving={setSaving} onClose={() => setOpen(false)} /> : <p role="status">{error || "正在加载岗位信息…"}</p>}</OperationModal>}
  </>;
}

function Editor({ data, onClose, onSaving }: { onSaving: (saving: boolean) => void; data: Awaited<ReturnType<typeof loadJobEditorAction>>; onClose: () => void }) {
  const job = data.view.jobTrack;
  const [lifecycle, setLifecycle] = useState(job.lifecycle);
  const [changeResume, setChangeResume] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [key] = useState(() => crypto.randomUUID());
  const local = (value: string) => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
  return <form className="create-form" onSubmit={event => { event.preventDefault(); if (pending) return; const form = new FormData(event.currentTarget); setError(""); onSaving(true); start(async () => { try { const result = await saveJobEditorAction(form); if (result.error) setError(result.error); else onClose(); } catch { setError("保存失败，请重试。"); } finally { onSaving(false); } }); }}>
    <input type="hidden" name="jobTrackId" value={job.id} /><input type="hidden" name="version" value={job.version} /><input type="hidden" name="idempotencyKey" value={key} />
    <fieldset disabled={pending} className="job-editor-fields">
      <label>公司<input name="companyName" defaultValue={job.companyName} required maxLength={255} /></label>
      <label>部门（可选）<input name="department" defaultValue={job.department ?? ""} maxLength={255} /></label>
      <div className="form-row"><label>岗位<input name="roleName" defaultValue={job.roleName} required maxLength={255} /></label><label>志愿（可选）<input type="number" name="preferenceRank" min="1" step="1" defaultValue={job.preferenceRank ?? ""} /></label></div>
      {job.lifecycle !== "ended" && <label>投递状态<select name="lifecycle" value={lifecycle} onChange={event => setLifecycle(event.target.value as typeof lifecycle)}><option value="planned">待投递</option><option value="active">已投递</option></select></label>}
      {job.lifecycle === "active" && lifecycle === "planned" && <p className="form-hint">保存后将移回待投递列表，清空当前投递时间；已有招聘进展和简历保留。</p>}
      {lifecycle === "active" && <><label>投递时间<DateTimeInput name="submittedAt" required={job.lifecycle === "planned" || Boolean(job.submittedAt)} defaultValue={job.submittedAt ? local(job.submittedAt) : job.lifecycle === "planned" ? local(new Date().toISOString()) : ""} /></label><label>投递简历<select aria-label="是否更换简历" value={changeResume ? "change" : "keep"} onChange={event => setChangeResume(event.target.value === "change")}><option value="keep">保留当前：{data.view.selectedResume?.name ?? "未关联简历"}</option><option value="change">选择或上传简历</option></select></label>{(changeResume || (job.lifecycle === "planned" && !data.view.selectedResume)) && <ResumeSelectionFields resumes={data.view.resumes} experiences={data.experiences} defaultResumeId={data.view.selectedResume?.id} />}</>}
      <label>岗位 JD 文本<textarea name="jobDescription" defaultValue={job.jobDescription ?? ""} rows={6} /></label>
      {data.view.jobDescriptionImages.length > 0 && <fieldset><legend>已有 JD 图片（勾选保留）</legend>{data.view.jobDescriptionImages.map(image => <label key={image.id}><input type="checkbox" name="imageIds" value={image.id} defaultChecked />{image.originalName}</label>)}</fieldset>}
      <label>添加 JD 图片<input type="file" name="jdImages" accept="image/jpeg,image/png,image/webp" multiple /></label><p className="form-hint">每次最多新增 4 张，每张最大 5MB。</p>
      <label>岗位链接（可选）<input type="url" name="jobUrl" defaultValue={job.jobUrl ?? ""} /></label>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer-actions"><button type="button" className="secondary-button" disabled={pending} onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={pending}>{pending ? "保存中…" : "保存修改"}</button></div>
  </form>;
}
