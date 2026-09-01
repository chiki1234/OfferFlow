"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { generalFaqCategories, experienceFaqCategories } from "@/modules/interview-knowledge/faq-batch";
import { parseFaqBlocks } from "@/modules/interview-knowledge/faq-parser";
import { commitFaqBatchAction, createExperienceAction, deleteFaqAction, setResumeExperiencesAction, updateExperienceAction, updateFaqAction, type KnowledgeActionState } from "./actions";

const initialState: KnowledgeActionState = { error: null, success: null };

export function ExperienceForm() {
  const [state, action] = useActionState(createExperienceAction, initialState);
  return <form action={action} className="create-form knowledge-form"><h3>新增经历</h3><label>经历名称<input name="name" placeholder="例如：DeepResearch 项目" required /></label><label>经历内容<textarea name="content" rows={5} placeholder="项目背景、你的职责、方案和结果…" required /></label><Feedback state={state} /><Submit label="保存经历" /></form>;
}

export function ExperienceEditor({ experience }: { experience: { id: string; name: string; content: string } }) {
  const [state, action] = useActionState(updateExperienceAction, initialState);
  return <details className="context-editor"><summary>编辑经历内容</summary><form action={action} className="create-form"><input type="hidden" name="experienceId" value={experience.id} /><label>经历名称<input name="name" defaultValue={experience.name} required /></label><label>经历内容<textarea name="content" rows={12} defaultValue={experience.content} required /></label><Feedback state={state} /><Submit label="保存经历" /></form></details>;
}

export function FaqBatchForm({ token, interviews, experiences }: { token: string; interviews: Array<{ id: string; companyName: string; roleName: string; roundLabel: string }>; experiences: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(commitFaqBatchAction, initialState);
  const [raw, setRaw] = useState("");
  const [bulkKind, setBulkKind] = useState<"experience" | "general">("experience");
  const [bulkCategory, setBulkCategory] = useState<string>(experienceFaqCategories[0]);
  const [bulkExperienceId, setBulkExperienceId] = useState(experiences[0]?.id ?? "");
  const [drafts, setDrafts] = useState<FaqDraft[]>([]);
  const parsed = useMemo(() => raw.trim() ? parseFaqBlocks(raw) : [], [raw]);
  const bulkCategories = categoriesFor(bulkKind);
  const selectedDrafts = drafts.filter((draft) => draft.selected);
  const canSubmit = selectedDrafts.length > 0 && selectedDrafts.every((draft) => draft.kind === "general" || draft.experienceId);

  function handleRawChange(value: string) {
    setRaw(value);
    setDrafts(parseFaqBlocks(value).flatMap((block) => block.status === "valid" ? [{
      key: `${block.index}:${block.raw}`,
      index: block.index,
      selected: true,
      question: block.question,
      answer: block.answer,
      kind: bulkKind,
      category: bulkCategory,
      experienceId: bulkKind === "experience" ? bulkExperienceId : "",
    } satisfies FaqDraft] : []));
  }

  function updateDraft(key: string, update: Partial<FaqDraft>) {
    setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, ...update } : draft));
  }

  function applyBulkSettings() {
    setDrafts((current) => current.map((draft) => draft.selected ? {
      ...draft,
      kind: bulkKind,
      category: bulkCategory,
      experienceId: bulkKind === "experience" ? bulkExperienceId : "",
    } : draft));
  }

  return <form action={action} className="create-form knowledge-form faq-import-form"><input type="hidden" name="idempotencyKey" value={token} /><input type="hidden" name="itemsJson" value={JSON.stringify(selectedDrafts.map(({ question, answer, kind, category, experienceId }) => ({ question, answer, kind, category, experienceId: kind === "experience" ? experienceId || null : null })))} /><h3>批量导入 FAQ</h3>
    <label>来源面试<select name="interviewId" required><option value="">选择一场面试</option>{interviews.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.roleName} · {item.roundLabel}</option>)}</select></label>
    <label>FAQ Blocks<textarea rows={10} value={raw} onChange={(event) => handleRawChange(event.target.value)} placeholder={"Q: 为什么这样设计？\nA: 因为…\n\n---\n\nQ: 遇到了什么挑战？\nA: …"} required /></label>
    {parsed.length > 0 && <div className="parse-summary"><strong>{parsed.filter((item) => item.status === "valid").length} 条可导入</strong>{parsed.some((item) => item.status === "invalid") && <span>{parsed.filter((item) => item.status === "invalid").length} 个 Block 需修正，本次会跳过</span>}</div>}
    {drafts.length > 0 && <>
      <fieldset className="faq-bulk-controls"><legend>批量设置已勾选项</legend><label>问题类型<select value={bulkKind} onChange={(event) => { const next = event.target.value as "experience" | "general"; setBulkKind(next); setBulkCategory(categoriesFor(next)[0]); }}><option value="experience">经历问题</option><option value="general">综合问题</option></select></label>{bulkKind === "experience" && <label>绑定经历<select value={bulkExperienceId} onChange={(event) => setBulkExperienceId(event.target.value)}><option value="">选择 Experience</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label>分类<select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>{bulkCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><button className="secondary-button" type="button" onClick={applyBulkSettings}>应用到已勾选</button></fieldset>
      <div className="faq-selection-row"><strong>逐条确认（已选 {selectedDrafts.length}/{drafts.length}）</strong><div><button type="button" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: true })))}>全选</button><button type="button" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))}>清空</button></div></div>
      <div className="faq-draft-list">{drafts.map((draft) => <article className={draft.selected ? "faq-draft selected" : "faq-draft"} key={draft.key}><label className="faq-draft-check"><input type="checkbox" checked={draft.selected} onChange={(event) => updateDraft(draft.key, { selected: event.target.checked })} /><span>FAQ {draft.index + 1}</span></label><label>问题<textarea rows={2} value={draft.question} onChange={(event) => updateDraft(draft.key, { question: event.target.value })} /></label><label>答案<textarea rows={4} value={draft.answer} onChange={(event) => updateDraft(draft.key, { answer: event.target.value })} /></label><div className="faq-draft-meta"><label>类型<select value={draft.kind} onChange={(event) => { const kind = event.target.value as "experience" | "general"; updateDraft(draft.key, { kind, category: categoriesFor(kind)[0], experienceId: kind === "experience" ? bulkExperienceId : "" }); }}><option value="experience">经历问题</option><option value="general">综合问题</option></select></label>{draft.kind === "experience" && <label>经历<select value={draft.experienceId} onChange={(event) => updateDraft(draft.key, { experienceId: event.target.value })}><option value="">选择 Experience</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label>分类<select value={draft.category} onChange={(event) => updateDraft(draft.key, { category: event.target.value })}>{categoriesFor(draft.kind).map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div></article>)}</div>
    </>}
    {parsed.filter((block) => block.status === "invalid").map((block) => <div className="faq-invalid-block" key={`invalid-${block.index}`}><strong>FAQ {block.index + 1}：{block.error}</strong><pre>{block.raw}</pre></div>)}
    <Feedback state={state} /><Submit disabled={!interviews.length || !canSubmit} label={selectedDrafts.length ? `导入 ${selectedDrafts.length} 条 FAQ` : "选择要导入的 FAQ"} />
  </form>;
}

type FaqDraft = {
  key: string;
  index: number;
  selected: boolean;
  question: string;
  answer: string;
  kind: "experience" | "general";
  category: string;
  experienceId: string;
};

function categoriesFor(kind: "experience" | "general"): readonly string[] {
  return kind === "experience" ? experienceFaqCategories : generalFaqCategories;
}

export function ResumeExperienceForm({ resumes, experiences }: { resumes: Array<{ id: string; name: string; experienceIds: string[] }>; experiences: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(setResumeExperiencesAction, initialState);
  const [resumeId, setResumeId] = useState(resumes[0]?.id ?? "");
  const selectedExperienceIds = resumes.find((resume) => resume.id === resumeId)?.experienceIds ?? [];
  return <form action={action} className="create-form knowledge-form"><h3>简历包含哪些经历？</h3><label>简历<select name="resumeId" value={resumeId} onChange={(event) => setResumeId(event.target.value)} required><option value="">选择简历</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label><fieldset className="experience-checks" key={`${resumeId}:${selectedExperienceIds.join(",")}`}>{experiences.map((item) => <label key={item.id}><input type="checkbox" name="experienceIds" value={item.id} defaultChecked={selectedExperienceIds.includes(item.id)} />{item.name}</label>)}</fieldset>{resumeId && <p className="form-hint">当前已关联 {selectedExperienceIds.length} 项经历。</p>}<Feedback state={state} /><Submit disabled={!resumes.length || !resumeId} label="保存关联" /></form>;
}

export function FaqEditor({ faq, experiences }: { faq: { id: string; question: string; answer: string; kind: "experience" | "general"; category: string; experienceId: string | null }; experiences: Array<{ id: string; name: string }> }) {
  const [updateState, updateAction] = useActionState(updateFaqAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteFaqAction, initialState);
  const [kind, setKind] = useState(faq.kind);
  const categories = kind === "experience" ? experienceFaqCategories : generalFaqCategories;
  return <details className="faq-editor"><summary>修正或删除</summary><form action={updateAction} className="create-form"><input type="hidden" name="faqId" value={faq.id} /><label>问题<textarea name="question" rows={2} defaultValue={faq.question} /></label><label>答案<textarea name="answer" rows={5} defaultValue={faq.answer} /></label><label>类型<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "experience" | "general")}><option value="experience">经历问题</option><option value="general">综合问题</option></select></label>{kind === "experience" && <label>经历<select name="experienceId" defaultValue={faq.experienceId ?? ""}><option value="">选择 Experience</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label>分类<select name="category" defaultValue={categories.includes(faq.category as never) ? faq.category : "其他"} key={kind}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><Feedback state={updateState} /><Submit label="保存修改" /></form><form action={deleteAction} className="faq-delete-form"><input type="hidden" name="faqId" value={faq.id} /><button type="submit">删除这条 FAQ</button>{deleteState.error && <small>{deleteState.error}</small>}</form></details>;
}

function Feedback({ state }: { state: KnowledgeActionState }) { return <>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}</>; }
function Submit({ label, disabled = false }: { label: string; disabled?: boolean }) { const { pending } = useFormStatus(); return <button className="primary-button wide" type="submit" disabled={disabled || pending}>{pending ? "保存中…" : label}</button>; }
