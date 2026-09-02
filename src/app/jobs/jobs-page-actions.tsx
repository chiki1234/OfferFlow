"use client";

import { useActionState, useCallback, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import type { ExperienceOption, ResumeOption } from "@/components/resume-selection-fields";
import { jobDetailAction, type JobDetailActionState } from "./[id]/actions";
import { CreateJobForm } from "./create-job-form";
import { QuickImportForm } from "./quick-import-form";

export function JobsPageActions({ resumes, experiences, tokens }: { resumes: ResumeOption[]; experiences: ExperienceOption[]; tokens: { create: string; quickImport: string } }) {
  const [modal, setModal] = useState<"create" | "import" | null>(null);
  const closeModal = useCallback(() => setModal(null), []);
  return <div className="jobs-page-actions">
    <button className="primary-button" onClick={() => setModal("create")} type="button"><Plus size={17} />新增投递岗位</button>
    <button className="secondary-button" onClick={() => setModal("import")} type="button"><Zap size={16} />极速建档</button>
    {modal === "create" && <OperationModal onClose={closeModal} title="新增投递岗位"><CreateJobForm experiences={experiences} idempotencyKey={tokens.create} onSuccess={closeModal} resumes={resumes} /></OperationModal>}
    {modal === "import" && <OperationModal description="适合一次补录多个历史岗位。" onClose={closeModal} title="极速建档"><QuickImportForm idempotencyKey={tokens.quickImport} onSuccess={closeModal} /></OperationModal>}
  </div>;
}

const initialDeleteState: JobDetailActionState = { error: null, success: null };

export function DeletePlannedJobButton({ jobTrackId, jobLabel, token }: { jobTrackId: string; jobLabel: string; token: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(jobDetailAction, initialDeleteState);
  if (state.success) return null;
  return <>
    <button className="danger-text-button" onClick={() => setOpen(true)} type="button"><Trash2 size={14} />删除</button>
    {open && <OperationModal onClose={() => setOpen(false)} title="确认删除待投递岗位"><form action={action} className="create-form delete-confirm-form"><input name="intent" type="hidden" value="delete_planned_job_track" /><input name="jobTrackId" type="hidden" value={jobTrackId} /><input name="idempotencyKey" type="hidden" value={token} /><p>确定删除“{jobLabel}”吗？岗位信息和 JD 将一并删除，且无法恢复。</p>{state.error && <p className="form-error">{state.error}</p>}<div className="modal-footer-actions"><button className="secondary-button" onClick={() => setOpen(false)} type="button">取消</button><button className="danger-button" type="submit">确认删除</button></div></form></OperationModal>}
  </>;
}
