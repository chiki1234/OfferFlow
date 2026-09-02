"use client";

import { useActionState, useCallback, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import type { FaqCategoryConfig } from "@/modules/interview-knowledge/faq-batch";
import { ExperienceForm, FaqBatchForm, ResumeExperienceForm } from "./knowledge-forms";
import { deleteExperienceAction, type KnowledgeActionState } from "./actions";

type Experience = { id: string; name: string };
type Interview = { id: string; companyName: string; roleName: string; roundLabel: string };
type Resume = { id: string; name: string; experienceIds: string[] };
const initialDeleteState: KnowledgeActionState = { error: null, success: null };

export function KnowledgeCreateButton({ token, interviews, experiences, faqCategories }: { token: string; interviews: Interview[]; experiences: Experience[]; faqCategories: FaqCategoryConfig }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button className="primary-button" onClick={() => setOpen(true)} type="button"><Plus size={17} />新增知识</button>{open && <OperationModal onClose={close} title="新增知识"><KnowledgeCreateForm experiences={experiences} faqCategories={faqCategories} interviews={interviews} onSuccess={close} token={token} /></OperationModal>}</>;
}

export function KnowledgeCreateForm({ token, interviews, experiences, faqCategories, onSuccess }: { token: string; interviews: Interview[]; experiences: Experience[]; faqCategories: FaqCategoryConfig; onSuccess?: () => void }) {
  const [kind, setKind] = useState<"faq" | "experience">("faq");
  return <div className="create-form"><label>新增类型<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="faq">批量导入 FAQ</option><option value="experience">新增经历</option></select></label>{kind === "faq" ? <FaqBatchForm experiences={experiences} faqCategories={faqCategories} interviews={interviews} onSuccess={onSuccess} token={token} /> : <ExperienceForm onSuccess={onSuccess} />}</div>;
}

export function ManageResumeExperienceButton({ resumes, experiences }: { resumes: Resume[]; experiences: Experience[] }) {
  const [open, setOpen] = useState(false);
  return <><button className="secondary-button compact-button" onClick={() => setOpen(true)} type="button"><Link2 size={15} />管理简历关联</button>{open && <OperationModal description="每份简历必须至少关联一项经历。" onClose={() => setOpen(false)} title="管理简历与经历"><ResumeExperienceForm experiences={experiences} resumes={resumes} /></OperationModal>}</>;
}

export function DeleteExperienceButton({ experience }: { experience: Experience }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteExperienceAction, initialDeleteState);
  if (state.success) return null;
  return <>
    <button aria-label={`删除经历 ${experience.name}`} className="danger-text-button" onClick={() => setOpen(true)} type="button"><Trash2 size={14} />删除</button>
    {open && <OperationModal onClose={() => setOpen(false)} title="确认删除经历"><form action={action} className="create-form delete-confirm-form"><input name="experienceId" type="hidden" value={experience.id} /><p>确定删除“{experience.name}”吗？删除后会解除它与简历的关联，且无法恢复；如果仍有关联的 FAQ，系统会阻止删除。</p>{state.error && <p className="form-error">{state.error}</p>}<div className="modal-footer-actions"><button className="secondary-button" disabled={pending} onClick={() => setOpen(false)} type="button">取消</button><button className="danger-button" disabled={pending} type="submit">{pending ? "删除中…" : "确认删除"}</button></div></form></OperationModal>}
  </>;
}
