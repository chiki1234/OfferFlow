"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { generalFaqCategories, experienceFaqCategories } from "@/modules/interview-knowledge/faq-batch";
import { parseFaqBlocks } from "@/modules/interview-knowledge/faq-parser";
import { commitFaqBatchAction, createExperienceAction, deleteFaqAction, setResumeExperiencesAction, updateFaqAction, type KnowledgeActionState } from "./actions";

const initialState: KnowledgeActionState = { error: null, success: null };

export function ExperienceForm() {
  const [state, action] = useActionState(createExperienceAction, initialState);
  return <form action={action} className="create-form knowledge-form"><h3>新增经历</h3><label>经历名称<input name="name" placeholder="例如：DeepResearch 项目" required /></label><label>经历内容<textarea name="content" rows={5} placeholder="项目背景、你的职责、方案和结果…" required /></label><Feedback state={state} /><Submit label="保存经历" /></form>;
}

export function FaqBatchForm({ token, interviews, experiences }: { token: string; interviews: Array<{ id: string; companyName: string; roleName: string; roundLabel: string }>; experiences: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(commitFaqBatchAction, initialState);
  const [raw, setRaw] = useState("");
  const [kind, setKind] = useState<"experience" | "general">("experience");
  const parsed = useMemo(() => raw.trim() ? parseFaqBlocks(raw) : [], [raw]);
  const categories = kind === "experience" ? experienceFaqCategories : generalFaqCategories;
  return <form action={action} className="create-form knowledge-form faq-import-form"><input type="hidden" name="idempotencyKey" value={token} /><h3>批量导入 FAQ</h3>
    <label>来源面试<select name="interviewId" required><option value="">选择一场面试</option>{interviews.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.roleName} · {item.roundLabel}</option>)}</select></label>
    <label>FAQ Blocks<textarea name="raw" rows={10} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder={"Q: 为什么这样设计？\nA: 因为…\n\n---\n\nQ: 遇到了什么挑战？\nA: …"} required /></label>
    {parsed.length > 0 && <div className="parse-summary"><strong>{parsed.filter((item) => item.status === "valid").length} 条可导入</strong>{parsed.some((item) => item.status === "invalid") && <span>{parsed.filter((item) => item.status === "invalid").length} 个 Block 需修正，本次会跳过</span>}</div>}
    <label>问题类型<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "experience" | "general")}><option value="experience">经历问题</option><option value="general">综合问题</option></select></label>
    {kind === "experience" && <label>绑定经历<select name="experienceId" required><option value="">选择 Experience</option>{experiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label>分类<select name="category" key={kind}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
    <Feedback state={state} /><Submit disabled={!interviews.length || !parsed.some((item) => item.status === "valid")} label="导入有效 FAQ" />
  </form>;
}

export function ResumeExperienceForm({ resumes, experiences }: { resumes: Array<{ id: string; name: string }>; experiences: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(setResumeExperiencesAction, initialState);
  return <form action={action} className="create-form knowledge-form"><h3>简历包含哪些经历？</h3><label>简历<select name="resumeId" required>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label><fieldset className="experience-checks">{experiences.map((item) => <label key={item.id}><input type="checkbox" name="experienceIds" value={item.id} />{item.name}</label>)}</fieldset><Feedback state={state} /><Submit disabled={!resumes.length} label="保存关联" /></form>;
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
