"use client";

import { useActionState, useCallback, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import { ExperienceForm, ResumeExperienceForm } from "./knowledge-forms";
import { FaqEntryForm, type FaqEntryFormProps } from "./faq-entry-form";
import { deleteExperienceAction, type KnowledgeActionState } from "./actions";

type Experience = { id: string; name: string };
type Resume = { id: string; name: string; experienceIds: string[] };
const initialDeleteState: KnowledgeActionState = { error: null, success: null };

export function FaqCreateButton(props: Omit<FaqEntryFormProps, "token" | "onSuccess" | "initialDraft">) {
  const [token, setToken] = useState<string | null>(null);
  const close = useCallback(() => setToken(null), []);
  return <><button className="primary-button" onClick={() => setToken(globalThis.crypto.randomUUID())} type="button"><Plus size={17} />新增 FAQ</button>{token && <OperationModal onClose={close} title="新增 FAQ"><FaqEntryForm {...props} onSuccess={close} token={token} /></OperationModal>}</>;
}

export function ExperienceCreateButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button className="secondary-button" onClick={() => setOpen(true)} type="button"><Plus size={17} />新增经历</button>{open && <OperationModal onClose={close} title="新增经历"><ExperienceForm onSuccess={close} /></OperationModal>}</>;
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
