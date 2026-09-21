"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ResumeSelectionFields, type ExperienceOption, type ResumeOption } from "@/components/resume-selection-fields";
import { createJobTrackAction, type CreateJobTrackFormState } from "./actions";
import type { CompanyOption } from "@/modules/workspace-queries/company-options";
import { validateCreateJobForm } from "./create-job-validation";
import { preferenceLabel } from "@/modules/workspace-queries/company-groups";

export function CreateJobForm({ idempotencyKey, resumes, experiences, companies = [], fixedCreationMode, initialCompany = "", onSuccess }: {
  idempotencyKey: string; resumes: ResumeOption[]; experiences: ExperienceOption[]; companies?: CompanyOption[];
  fixedCreationMode?: "planned" | "active"; initialCompany?: string; onSuccess?: () => void;
}) {
  const [state, setState] = useState<CreateJobTrackFormState>({ error: null, success: null });
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState(fixedCreationMode ?? "planned");
  const [company, setCompany] = useState(initialCompany);
  const [roles, setRoles] = useState(() => [{ id: 0, rank: String((companies.find(item => item.name.trim().toLowerCase() === initialCompany.trim().toLowerCase())?.maxRank ?? 0) + 1), manual: false }]);
  const [nextId, setNextId] = useState(1);
  const listId = useId();
  useEffect(() => { if (state.success) onSuccess?.(); }, [state.success, onSuccess]);
  useEffect(() => {
    if (!state.error) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    first?.focus({ preventScroll: true });
  }, [state]);
  function field(name: string) {
    return { "aria-invalid": state.fieldErrors?.[name] ? true as const : undefined, "aria-describedby": state.fieldErrors?.[name] ? listId + "-" + name + "-error" : undefined };
  }
  function error(name: string) {
    return state.fieldErrors?.[name] ? <span className="job-field-error" id={listId + "-" + name + "-error"}>{state.fieldErrors[name]}</span> : null;
  }
  const existing = companies.find(item => item.name.trim().toLowerCase() === company.trim().toLowerCase());
  function changeCompany(value: string) {
    setCompany(value);
    const max = companies.find(item => item.name.trim().toLowerCase() === value.trim().toLowerCase())?.maxRank ?? 0;
    setRoles(current => current.map((role, index) => role.manual ? role : { ...role, rank: String(max + index + 1) }));
  }
  return <form ref={formRef} noValidate className="create-form company-job-form" onSubmit={event => {
    event.preventDefault();
    if (submitting.current || state.success) return;
    const data = new FormData(event.currentTarget);
    const fieldErrors = validateCreateJobForm(data);
    if (Object.keys(fieldErrors).length) {
      setState({ error: "请修改标红的表单项后保存。", success: null, fieldErrors });
      return;
    }
    submitting.current = true;
    startTransition(async () => {
      try { setState(await createJobTrackAction(state, data)); }
      catch { setState({ error: "保存失败，填写内容已保留，请稍后重试。", success: null }); }
      finally { submitting.current = false; }
    });
  }}>
    <fieldset className="job-form-content" disabled={pending || Boolean(state.success)}>
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    {fixedCreationMode ? <input name="creationMode" type="hidden" value={mode} /> : <label>新增方式<select name="creationMode" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="planned">待投递</option><option value="active">已投递</option></select></label>}
    <label>公司<input {...field("companyName")} name="companyName" autoComplete="off" list={listId} value={company} readOnly={Boolean(initialCompany)} onChange={event => changeCompany(event.target.value)} placeholder="输入或选择已有公司" required />{error("companyName")}</label>
    <datalist id={listId}>{companies.map(item => <option key={item.name} value={item.name} />)}</datalist>
    {roles.map((role, index) => <fieldset className="company-role-fields" key={role.id}>
      <legend>岗位 {index + 1}</legend><input name="roleKeys" type="hidden" value={role.id} />
      <div className="form-row"><label>岗位<input {...field(`roles.${role.id}.roleName`)} name={`roles.${role.id}.roleName`} placeholder="例如：AI 解决方案工程师" required />{error(`roles.${role.id}.roleName`)}</label><label>志愿（可选）<select {...field(`roles.${role.id}.preferenceRank`)} name={`roles.${role.id}.preferenceRank`} value={role.rank} onChange={event => setRoles(current => current.map(item => item.id === role.id ? { ...item, rank: event.target.value, manual: true } : item))}><option value="">未设置</option>{Array.from({ length: Math.max(10, (existing?.maxRank ?? 0) + roles.length + 5, ...roles.map(item => Number(item.rank) || 0)) }, (_, i) => <option key={i} value={i + 1}>{preferenceLabel(i + 1)}</option>)}</select>{error(`roles.${role.id}.preferenceRank`)}</label></div>
      {mode === "active" && <ResumeSelectionFields prefix={`roles.${role.id}.`} resumes={resumes} experiences={experiences} fieldErrors={state.fieldErrors} errorIdPrefix={listId} />}
      <label>部门（可选）<input {...field(`roles.${role.id}.department`)} name={`roles.${role.id}.department`} maxLength={255} placeholder="例如：云计算事业部" />{error(`roles.${role.id}.department`)}</label><label>岗位 JD 文本（可选）<textarea {...field(`roles.${role.id}.jobDescription`)} name={`roles.${role.id}.jobDescription`} rows={5} placeholder="岗位职责和要求" />{error(`roles.${role.id}.jobDescription`)}</label>
      <label>岗位链接（可选）<input {...field(`roles.${role.id}.jobUrl`)} name={`roles.${role.id}.jobUrl`} type="url" placeholder="https://" />{error(`roles.${role.id}.jobUrl`)}</label>
      {roles.length > 1 && <button className="danger-text-button" type="button" onClick={() => setRoles(current => current.filter(item => item.id !== role.id))}><Trash2 size={14} />移除此岗位</button>}
    </fieldset>)}
    <button className="secondary-button" type="button" disabled={roles.length >= 30} onClick={() => { setRoles(current => [...current, { id: nextId, rank: String(Math.max(existing?.maxRank ?? 0, ...current.map(item => Number(item.rank) || 0)) + 1), manual: false }]); setNextId(value => value + 1); }}><Plus size={16} />添加岗位</button>
    </fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}
    <div className="form-save-bar"><button className="primary-button wide" disabled={pending || Boolean(state.success)} type="submit">{pending ? "保存中…" : mode === "active" ? "保存为已投递" : "保存为待投递"}</button></div>
  </form>;
}
