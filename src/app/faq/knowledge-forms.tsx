"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { OperationModal } from "@/components/operation-modal";
import type { FaqBinding, FaqCategoryConfig } from "@/modules/interview-knowledge/faq-batch";
import { parseFaqBlocks } from "@/modules/interview-knowledge/faq-parser";
import { commitFaqBatchAction, createExperienceAction, createFaqCategoryAction, deleteFaqAction, deleteFaqCategoryAction, renameFaqCategoryAction, setResumeExperiencesAction, updateExperienceAction, updateFaqAction, type KnowledgeActionState } from "./actions";

const initialState: KnowledgeActionState = { error: null, success: null };

export function ExperienceForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createExperienceAction, initialState);
  useEffect(() => { if (state.success) onSuccess?.(); }, [onSuccess, state.success]);
  return <form action={action} className="create-form knowledge-form"><h3>新增经历</h3><label>经历名称<input name="name" placeholder="例如：DeepResearch 项目" required /></label><label>经历内容<textarea name="content" rows={5} placeholder="项目背景、你的职责、方案和结果…" required /></label><Feedback state={state} /><Submit label="保存经历" /></form>;
}

export function ExperienceEditor({ experience }: { experience: { id: string; name: string; content: string } }) {
  const [state, action] = useActionState(updateExperienceAction, initialState);
  return <details className="context-editor"><summary>编辑经历内容</summary><form action={action} className="create-form"><input type="hidden" name="experienceId" value={experience.id} /><label>经历名称<input name="name" defaultValue={experience.name} required /></label><label>经历内容<textarea name="content" rows={12} defaultValue={experience.content} required /></label><Feedback state={state} /><Submit label="保存经历" /></form></details>;
}

export function FaqBatchForm({ token, interviews, experiences, faqCategories, onSuccess }: { token: string; interviews: Array<{ id: string; companyName: string; roleName: string; roundLabel: string }>; experiences: Array<{ id: string; name: string }>; faqCategories: FaqCategoryConfig; onSuccess?: () => void }) {
  const [state, action] = useActionState(commitFaqBatchAction, initialState);
  const [raw, setRaw] = useState("");
  const [drafts, setDrafts] = useState<FaqDraft[]>([]);
  const parsed = useMemo(() => raw.trim() ? parseFaqBlocks(raw) : [], [raw]);
  const selectedDrafts = drafts.filter((draft) => draft.selected);
  const canSubmit = selectedDrafts.length > 0 && selectedDrafts.every((draft) =>
    draft.question.trim() && draft.binding && (draft.binding === "unbound" || draft.experienceId),
  );
  useEffect(() => { if (state.success) onSuccess?.(); }, [onSuccess, state.success]);

  function handleRawChange(value: string) {
    setRaw(value);
    setDrafts(parseFaqBlocks(value).flatMap((block) => block.status === "valid" ? [{
      key: `${block.index}:${block.raw}`,
      index: block.index,
      selected: true,
      question: block.question,
      answer: block.answer,
      binding: "",
      category: "",
      experienceId: "",
    } satisfies FaqDraft] : []));
  }

  function updateDraft(key: string, update: Partial<FaqDraft>) {
    setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...update } : draft));
  }

  return <form action={action} className="create-form knowledge-form faq-import-form"><input type="hidden" name="idempotencyKey" value={token} /><input type="hidden" name="itemsJson" value={JSON.stringify(selectedDrafts.map(({ question, answer, binding, category, experienceId }) => ({ question, answer, binding, category: binding === "unbound" ? category || null : null, experienceId: binding === "bound" ? experienceId || null : null })))} /><h3>批量导入 FAQ</h3>
    <label>来源面试（可选）<select name="interviewId"><option value="">不关联面试</option>{interviews.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.roleName} · {item.roundLabel}</option>)}</select></label>
    <label>FAQ Blocks<textarea rows={10} value={raw} onChange={(event) => handleRawChange(event.target.value)} placeholder={"### Q：为什么这样设计？\nA：因为…\n\n---\n\nQ: 还遇到了什么挑战？"} required /></label>
    {parsed.length > 0 && <div className="parse-summary"><strong>{parsed.filter((item) => item.status === "valid").length} 条可导入</strong>{parsed.some((item) => item.status === "invalid") && <span>{parsed.filter((item) => item.status === "invalid").length} 个 Block 需修正，本次会跳过</span>}</div>}
    {drafts.length > 0 && <>
      <div className="faq-selection-row"><strong>逐条确认（已选 {selectedDrafts.length}/{drafts.length}）</strong><div><button type="button" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: true })))}>全选</button><button type="button" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))}>清空</button></div></div>
      <p className="form-hint">每条 FAQ 都必须确认是否绑定经历；未绑定经历时，分类可以稍后补充。</p>
      <div className="faq-draft-list">{drafts.map((draft) => <article className={draft.selected ? "faq-draft selected" : "faq-draft"} key={draft.key}><label className="faq-draft-check"><input type="checkbox" checked={draft.selected} onChange={(event) => updateDraft(draft.key, { selected: event.target.checked })} /><span>FAQ {draft.index + 1}</span></label><label>问题<textarea rows={2} value={draft.question} onChange={(event) => updateDraft(draft.key, { question: event.target.value })} /></label><label>答案<textarea rows={4} value={draft.answer} onChange={(event) => updateDraft(draft.key, { answer: event.target.value })} /></label><div className="faq-draft-meta"><label>是否绑定经历（必填）<select value={draft.binding} onChange={(event) => { const binding = event.target.value as FaqDraft["binding"]; updateDraft(draft.key, { binding, category: "", experienceId: "" }); }}><option value="">请选择</option><option value="bound">是</option><option value="unbound">否</option></select></label>{draft.binding === "bound" && <label>对应经历（必填）<select value={draft.experienceId} onChange={(event) => updateDraft(draft.key, { experienceId: event.target.value })}><option value="">{experiences.length ? "请选择经历" : "暂无经历，请先新增经历"}</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{draft.binding === "unbound" && <label>分类（可选）<select value={draft.category} onChange={(event) => updateDraft(draft.key, { category: event.target.value })}><option value="">暂不设置</option>{faqCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>}</div></article>)}</div>
    </>}
    {parsed.filter((block) => block.status === "invalid").map((block) => <div className="faq-invalid-block" key={`invalid-${block.index}`}><strong>FAQ {block.index + 1}：{block.error}</strong><pre>{block.raw}</pre></div>)}
    <Feedback state={state} /><Submit disabled={!canSubmit} label={selectedDrafts.length ? `导入 ${selectedDrafts.length} 条 FAQ` : "选择要导入的 FAQ"} />
  </form>;
}

type FaqDraft = {
  key: string;
  index: number;
  selected: boolean;
  question: string;
  answer: string;
  binding: "" | FaqBinding;
  category: string;
  experienceId: string;
};

export function ResumeExperienceForm({ resumes, experiences }: { resumes: Array<{ id: string; name: string; experienceIds: string[] }>; experiences: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(setResumeExperiencesAction, initialState);
  const [resumeId, setResumeId] = useState(resumes[0]?.id ?? "");
  const selectedExperienceIds = resumes.find((resume) => resume.id === resumeId)?.experienceIds ?? [];
  return <form action={action} className="create-form knowledge-form"><h3>简历包含哪些经历？</h3><label>简历<select name="resumeId" value={resumeId} onChange={(event) => setResumeId(event.target.value)} required><option value="">选择简历</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label><fieldset className="experience-checks" key={`${resumeId}:${selectedExperienceIds.join(",")}`}>{experiences.map((item) => <label key={item.id}><input type="checkbox" name="experienceIds" value={item.id} defaultChecked={selectedExperienceIds.includes(item.id)} />{item.name}</label>)}</fieldset>{resumeId && <p className="form-hint">当前已关联 {selectedExperienceIds.length} 项经历。</p>}<Feedback state={state} /><Submit disabled={!resumes.length || !resumeId} label="保存关联" /></form>;
}

export function FaqEditor({ faq, experiences, faqCategories, incomplete = false }: { faq: { id: string; question: string; answer: string; category: string | null; experienceId: string | null }; experiences: Array<{ id: string; name: string }>; faqCategories: FaqCategoryConfig; incomplete?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <div className="faq-editor">
    <button className={incomplete ? "faq-settings-button incomplete" : "faq-settings-button"} onClick={() => setOpen(true)} type="button">{incomplete ? <AlertCircle size={14} /> : <Settings2 size={14} />}{incomplete ? "补充设置" : "编辑 FAQ"}</button>
    {open && <FaqEditorModal experiences={experiences} faq={faq} faqCategories={faqCategories} incomplete={incomplete} onClose={close} />}
  </div>;
}

function FaqEditorModal({ faq, experiences, faqCategories, incomplete, onClose }: { faq: { id: string; question: string; answer: string; category: string | null; experienceId: string | null }; experiences: Array<{ id: string; name: string }>; faqCategories: FaqCategoryConfig; incomplete: boolean; onClose: () => void }) {
  const [updateState, updateAction] = useActionState(updateFaqAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteFaqAction, initialState);
  const [binding, setBinding] = useState<FaqBinding>(faq.experienceId ? "bound" : "unbound");
  const [experienceId, setExperienceId] = useState(faq.experienceId ?? "");
  const [category, setCategory] = useState(faq.category && faqCategories.includes(faq.category) ? faq.category : "");
  const [manageCategories, setManageCategories] = useState(false);
  useEffect(() => { if (updateState.success || deleteState.success) onClose(); }, [deleteState.success, onClose, updateState.success]);
  return <OperationModal description={incomplete ? "这条未绑定经历的 FAQ 还没有分类。" : undefined} onClose={onClose} title="设置 FAQ"><form action={updateAction} className="create-form"><input type="hidden" name="faqId" value={faq.id} /><label>问题<textarea name="question" rows={2} defaultValue={faq.question} /></label><label>答案<textarea name="answer" rows={5} defaultValue={faq.answer} /></label><label>是否绑定经历<select name="binding" value={binding} onChange={(event) => { const nextBinding = event.target.value as FaqBinding; setBinding(nextBinding); setExperienceId(""); setCategory(""); }}><option value="bound">是</option><option value="unbound">否</option></select></label>{binding === "bound" ? <label>对应经历<select name="experienceId" required value={experienceId} onChange={(event) => setExperienceId(event.target.value)}><option value="">{experiences.length ? "请选择经历" : "暂无经历，请先新增经历"}</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <label>分类（可选）<select name="category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">暂不设置</option>{faqCategories.map((item) => <option key={item}>{item}</option>)}</select></label>}<Feedback state={updateState} /><Submit label="保存修改" /></form><button className="faq-category-manage-toggle" onClick={() => setManageCategories((current) => !current)} type="button"><Settings2 size={14} />{manageCategories ? "收起分类管理" : "管理未绑定 FAQ 分类"}</button>{manageCategories && <FaqCategoryManager categories={faqCategories} />}<form action={deleteAction} className="faq-delete-form"><input type="hidden" name="faqId" value={faq.id} /><button type="submit">删除这条 FAQ</button>{deleteState.error && <small>{deleteState.error}</small>}</form></OperationModal>;
}

function FaqCategoryManager({ categories }: { categories: FaqCategoryConfig }) {
  return <section className="faq-category-manager">
    <div><strong>未绑定 FAQ 分类</strong><p>分类只用于未绑定经历的问题。重命名会同步历史 FAQ；删除会把历史 FAQ 的分类重置为“暂不设置”。</p></div>
    <div className="faq-category-group"><div className="faq-category-list">{categories.map((name) => <FaqCategoryRow key={name} name={name} />)}{!categories.length && <p className="form-hint">暂无分类，可以在下方新增。</p>}</div><FaqCategoryCreateForm /></div>
  </section>;
}

function FaqCategoryCreateForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState(async (previousState: KnowledgeActionState, formData: FormData) => {
    const result = await createFaqCategoryAction(previousState, formData);
    if (result.success) setName("");
    return result;
  }, initialState);
  return <form action={action} className="faq-category-create"><input aria-label="新增未绑定 FAQ 分类" maxLength={64} name="name" onChange={(event) => setName(event.target.value)} placeholder="输入新分类名称" value={name} /><button disabled={pending || !name.trim()} type="submit"><Plus size={14} />{pending ? "新增中…" : "新增"}</button><Feedback state={state} /></form>;
}

function FaqCategoryRow({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameState, renameAction, renaming] = useActionState(async (previousState: KnowledgeActionState, formData: FormData) => {
    const result = await renameFaqCategoryAction(previousState, formData);
    if (result.success) setEditing(false);
    return result;
  }, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(async (previousState: KnowledgeActionState, formData: FormData) => {
    const result = await deleteFaqCategoryAction(previousState, formData);
    if (result.success) setConfirmDelete(false);
    return result;
  }, initialState);
  return <div className="faq-category-row">
    {editing ? <form action={renameAction} className="faq-category-rename"><input name="currentName" type="hidden" value={name} /><input aria-label={`重命名分类 ${name}`} defaultValue={name} maxLength={64} name="nextName" required /><button disabled={renaming} type="submit">{renaming ? "保存中…" : "保存"}</button><button disabled={renaming} onClick={() => setEditing(false)} type="button">取消</button><Feedback state={renameState} /></form> : <><span>{name}</span><div><button aria-label={`重命名分类 ${name}`} onClick={() => setEditing(true)} type="button"><Pencil size={14} /></button><button aria-label={`删除分类 ${name}`} className="danger" onClick={() => setConfirmDelete(true)} type="button"><Trash2 size={14} /></button></div></>}
    {confirmDelete && <div className="faq-category-delete-confirm"><p>确定删除“{name}”吗？过去使用该分类的 FAQ 会被重置为“暂不设置”。</p><form action={deleteAction}><input name="name" type="hidden" value={name} /><Feedback state={deleteState} /><div><button disabled={deleting} onClick={() => setConfirmDelete(false)} type="button">取消</button><button className="danger" disabled={deleting} type="submit">{deleting ? "删除中…" : "确认删除"}</button></div></form></div>}
  </div>;
}

function Feedback({ state }: { state: KnowledgeActionState }) { return <>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</>; }
function Submit({ label, disabled = false }: { label: string; disabled?: boolean }) { const { pending } = useFormStatus(); return <button className="primary-button wide" type="submit" disabled={disabled || pending}>{pending ? "保存中…" : label}</button>; }
