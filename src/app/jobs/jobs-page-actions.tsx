"use client";

import { useActionState, useCallback, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import type { ExperienceOption, ResumeOption } from "@/components/resume-selection-fields";
import { jobDetailAction, type JobDetailActionState } from "./[id]/actions";
import { CreateJobForm } from "./create-job-form";
import { QuickImportForm } from "./quick-import-form";

export type JobCreationOptions = { companies: import("@/modules/workspace-queries/company-options").CompanyOption[]; resumes: ResumeOption[]; experiences: ExperienceOption[]; creationMode: "planned" | "active" };

export function AddPreferenceButton({ companyName, ...options }: JobCreationOptions & { companyName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const close = useCallback(() => setToken(null), []);
  return <><button className="secondary-button compact-button" type="button" onClick={() => setToken(crypto.randomUUID())}><Plus size={14} />添加志愿</button>{token && <OperationModal title="添加志愿" onClose={close}><CreateJobForm {...options} fixedCreationMode={options.creationMode} initialCompany={companyName} idempotencyKey={token} onSuccess={close} /></OperationModal>}</>;
}

export function JobsPageActions({ resumes, experiences, companies, creationMode, tokens }: JobCreationOptions & { tokens: { create: string; quickImport: string } }) {
  const [modal, setModal] = useState<"create" | "import" | null>(null);
  const closeModal = useCallback(() => setModal(null), []);
  return <div className="jobs-page-actions">
    <button className="primary-button" onClick={() => setModal("create")} type="button"><Plus size={17} />新增投递岗位</button>
    <button className="secondary-button" onClick={() => setModal("import")} type="button"><Zap size={16} />极速建档</button>
    {modal === "create" && <OperationModal onClose={closeModal} title={creationMode === "planned" ? "新增待投递岗位" : "新增已投递岗位"}><CreateJobForm fixedCreationMode={creationMode} companies={companies} experiences={experiences} idempotencyKey={tokens.create} onSuccess={closeModal} resumes={resumes} /></OperationModal>}
    {modal === "import" && <OperationModal description="适合一次补录多个历史岗位。" onClose={closeModal} title="极速建档"><QuickImportForm idempotencyKey={tokens.quickImport} onSuccess={closeModal} /></OperationModal>}
  </div>;
}

const initialDeleteState: JobDetailActionState = { error: null, success: null };

export function DeleteJobButton({ jobTrackId, jobLabel, token, detail = false }: { jobTrackId: string; jobLabel: string; token: string; detail?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(jobDetailAction, initialDeleteState);
  if (state.success) return null;
  return <>
    <button className="danger-text-button" onClick={() => setOpen(true)} type="button"><Trash2 size={14} />删除</button>
    {open && <OperationModal onClose={() => setOpen(false)} title="确认删除岗位"><form action={action} className="create-form delete-confirm-form"><input name="returnToJobs" type="hidden" value={String(detail)} /><input name="intent" type="hidden" value="delete_job_track" /><input name="jobTrackId" type="hidden" value={jobTrackId} /><input name="idempotencyKey" type="hidden" value={token} /><p>确定删除“{jobLabel}”吗？岗位信息、JD、笔面试、任务和进展记录将一并删除，且无法恢复。简历库和知识库内容保留，相关来源关联解除。</p>{state.error && <p className="form-error">{state.error}</p>}<div className="modal-footer-actions"><button className="secondary-button" onClick={() => setOpen(false)} type="button">取消</button><button className="danger-button" disabled={pending} type="submit">{pending ? "删除中…" : "确认删除"}</button></div></form></OperationModal>}
  </>;
}
