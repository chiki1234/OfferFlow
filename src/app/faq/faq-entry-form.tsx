"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, LayersPlus, Plus, Trash2 } from "lucide-react";
import { NO_SOURCE_INTERVIEW, type FaqCategoryConfig, type FaqImportItem } from "@/modules/interview-knowledge/faq-batch";
import { faqEntryPayload, newFaqEntryCard, newFaqEntryGroup, restoreFaqEntryGroups, type FaqEntryCard, type FaqEntryGroup } from "@/modules/interview-knowledge/faq-entry";
import { parseFaqBlocks } from "@/modules/interview-knowledge/faq-parser";
import { commitFaqBatchAction, type KnowledgeActionState } from "./actions";
import { beginFaqAnalysis, importEditedFaqBatch } from "./import-actions";
import { FaqImportProgress, FaqTaskDialog } from "./import-progress";
import { withFaqRequestTimeout } from "./import-request";

export type FaqImportEditDraft = { batchId: string; items: FaqImportItem[]; sourceInterviewId: string | null };
export type FaqEntryFormProps = {
  token: string;
  interviews: Array<{ id: string; companyName: string; roleName: string; roundLabel: string }>;
  experiences: Array<{ id: string; name: string }>;
  faqCategories: FaqCategoryConfig;
  onSuccess?: () => void;
  initialDraft?: FaqImportEditDraft;
};
const initialState: KnowledgeActionState = { error: null, success: null };

export function FaqEntryForm({ token, interviews, experiences, faqCategories, onSuccess, initialDraft }: FaqEntryFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nextFocus = useRef<string | null>(null);
  const [state, action, pending] = useActionState(commitFaqBatchAction, initialState);
  const [groups, setGroups] = useState(() => initialDraft ? restoreFaqEntryGroups(initialDraft.items, initialDraft.sourceInterviewId) : [newFaqEntryGroup("group-1")]);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ groupId: string; cardId?: string } | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState(initialDraft?.batchId ?? null);
  const [importKey, setImportKey] = useState(token);
  const editedSubmission = useRef<{ payload: string; key: string } | null>(null);
  const [starting, startTransition] = useTransition();
  const busy = pending || starting;
  const payload = faqEntryPayload(groups);
  const total = groups.reduce((sum, group) => sum + group.cards.length, 0);
  const selected = payload.reduce((sum, group) => sum + group.items.length, 0);
  const showValidation = validationAttempt > 0;
  const sourceMissing = (group: FaqEntryGroup) => group.interviewId !== NO_SOURCE_INTERVIEW && !interviews.some((interview) => interview.id === group.interviewId);
  const experienceMissing = (group: FaqEntryGroup) => group.binding === "bound" && !experiences.some((experience) => experience.id === group.experienceId);
  const valid = selected > 0 && selected <= 100 && groups.every((group) => !group.raw.trim()) && groups.every((group) => !group.cards.some((card) => card.selected) || (
    !sourceMissing(group) && group.binding && !experienceMissing(group) && group.cards.every((card) => !card.selected || card.question.trim())
  ));

  useEffect(() => { if (state.success) onSuccess?.(); }, [state.success, onSuccess]);
  useEffect(() => {
    if (!validationAttempt) return;
    focusField(formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]'));
  }, [validationAttempt]);
  useEffect(() => {
    if (!nextFocus.current) return;
    const target = Array.from(formRef.current?.querySelectorAll<HTMLElement>("[data-focus-key]") ?? []).find((element) => element.dataset.focusKey === nextFocus.current);
    nextFocus.current = null;
    focusField(target);
  }, [groups]);

  function updateGroup(id: string, update: Partial<FaqEntryGroup>) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...update } : group));
  }
  function updateCard(groupId: string, cardId: string, update: Partial<FaqEntryCard>) {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, cards: group.cards.map((card) => card.id === cardId ? { ...card, ...update } : card) } : group));
  }
  function appendCard(group: FaqEntryGroup) {
    if (total >= 100) return;
    const card = newFaqEntryCard(globalThis.crypto.randomUUID());
    nextFocus.current = card.id;
    updateGroup(group.id, { cards: [...group.cards, card] });
  }
  function appendGroup() {
    if (total >= 100) return;
    const group = newFaqEntryGroup(globalThis.crypto.randomUUID());
    nextFocus.current = group.id;
    setGroups((current) => [...current, group]);
  }
  function remove() {
    if (!removeTarget) return;
    setGroups((current) => removeTarget.cardId
      ? current.map((group) => group.id === removeTarget.groupId ? { ...group, cards: group.cards.filter((card) => card.id !== removeTarget.cardId) } : group)
      : current.filter((group) => group.id !== removeTarget.groupId));
    setRemoveTarget(null);
  }
  function applyPaste(group: FaqEntryGroup) {
    const parsed = parseFaqBlocks(group.raw).filter((block) => block.status === "valid");
    const existing = group.cards.filter((card) => card.question.trim() || card.answer.trim());
    if (!parsed.length || total - group.cards.length + existing.length + parsed.length > 100) return;
    const cards = parsed.map((block) => ({ ...newFaqEntryCard(globalThis.crypto.randomUUID()), question: block.question, answer: block.answer }));
    nextFocus.current = cards[0].id;
    updateGroup(group.id, { cards: [...existing, ...cards], raw: "", pasteOpen: false });
  }
  const handleImported = useCallback(() => {
    editedSubmission.current = null;
    setAnalysisId(null);
    setGroups([newFaqEntryGroup("group-1")]);
    setValidationAttempt(0);
    setEditingBatchId(null);
    setImportKey(globalThis.crypto.randomUUID());
    onSuccess?.();
  }, [onSuccess]);
  const handleReturnToEdit = useCallback(() => {
    editedSubmission.current = null;
    setEditingBatchId(analysisId);
    setAnalysisId(null);
    setAnalysisError(null);
    setImportKey(globalThis.crypto.randomUUID());
  }, [analysisId]);

  function chooseImport(useAi: boolean) {
    if (!formRef.current || busy) return;
    const data = new FormData(formRef.current);
    const fingerprint = JSON.stringify([data.get("groupsJson"), useAi, editingBatchId]);
    if (editedSubmission.current?.payload !== fingerprint) editedSubmission.current = { payload: fingerprint, key: editedSubmission.current || editingBatchId ? globalThis.crypto.randomUUID() : importKey };
    data.set("idempotencyKey", editedSubmission.current.key);
    setAnalysisError(null);
    startTransition(async () => {
      try {
        if (!useAi) {
          if (!editingBatchId) { action(data); setChoiceOpen(false); return; }
          const imported = await withFaqRequestTimeout(() => importEditedFaqBatch(data));
          if (imported.error) setAnalysisError(imported.error);
          else { setChoiceOpen(false); handleImported(); if (initialDraft) router.replace(`/faq?imported=${imported.result?.importedCount ?? 0}&merged=0`); router.refresh(); }
          return;
        }
        const result = await withFaqRequestTimeout(() => beginFaqAnalysis(data));
        if (result.error) setAnalysisError(result.error);
        else { setChoiceOpen(false); setAnalysisId(result.batchId); }
      } catch { setAnalysisError("连接失败，请重试。"); }
    });
  }

  return <>
    <form action={action} ref={formRef} noValidate className="create-form faq-import-form faq-entry-form" onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      if (groups.some((group) => group.raw.trim())) setGroups((current) => current.map((group) => group.raw.trim() ? { ...group, pasteOpen: true } : group));
      setValidationAttempt((attempt) => attempt + 1);
      if (valid) { setAnalysisError(null); setChoiceOpen(true); }
    }}>
      <input type="hidden" name="idempotencyKey" value={importKey} />
      <input type="hidden" name="groupsJson" value={JSON.stringify(payload)} />
      {editingBatchId && <input type="hidden" name="replaceBatchId" value={editingBatchId} />}
      <fieldset disabled={busy} className="faq-entry-groups">
        {groups.map((group, groupIndex) => {
          const checked = group.cards.filter((card) => card.selected).length;
          const validate = showValidation && checked > 0;
          const parsed = group.raw.trim() ? parseFaqBlocks(group.raw) : [];
          const parsedCount = parsed.filter((block) => block.status === "valid").length;
          const invalidBlocks = parsed.filter((block) => block.status === "invalid");
          const pasteTotal = total - group.cards.filter((card) => !card.question.trim() && !card.answer.trim()).length + parsedCount;
          return <section className="faq-entry-group" aria-label={`第 ${groupIndex + 1} 组`} key={group.id}>
            <div className="faq-group-settings">
              <div className="faq-group-heading"><h3><span>{String(groupIndex + 1).padStart(2, "0")}</span>批量设置</h3><div><span className="faq-entry-count">{checked} 条</span>{groups.length > 1 && <button type="button" className="faq-entry-remove" aria-label={`移除第 ${groupIndex + 1} 组`} onClick={() => setRemoveTarget({ groupId: group.id })}><Trash2 size={16} /></button>}</div></div>
              <div className="faq-group-fields">
                <label className="faq-group-source">来源面试<select name="interviewId" data-focus-key={group.id} value={sourceMissing(group) ? "" : group.interviewId} required aria-invalid={validate && sourceMissing(group)} onChange={(event) => updateGroup(group.id, { interviewId: event.target.value })}><option value="">请选择</option><option value={NO_SOURCE_INTERVIEW}>无来源面试</option>{interviews.map((interview) => <option key={interview.id} value={interview.id}>{interview.companyName} · {interview.roleName} · {interview.roundLabel}</option>)}</select>{validate && sourceMissing(group) && <span className="faq-field-error">请选择来源面试</span>}</label>
                <label>是否绑定经历<select value={group.binding} required aria-invalid={validate && !group.binding} onChange={(event) => updateGroup(group.id, { binding: event.target.value as FaqEntryGroup["binding"], experienceId: "", category: "" })}><option value="">请选择</option><option value="bound">是</option><option value="unbound">否</option></select>{validate && !group.binding && <span className="faq-field-error">请选择是否绑定经历</span>}</label>
                {group.binding === "bound" && <label>对应经历<select value={experienceMissing(group) ? "" : group.experienceId} required aria-invalid={validate && experienceMissing(group)} onChange={(event) => updateGroup(group.id, { experienceId: event.target.value })}><option value="">{experiences.length ? "请选择经历" : "暂无经历"}</option>{experiences.map((experience) => <option key={experience.id} value={experience.id}>{experience.name}</option>)}</select>{validate && experienceMissing(group) && <span className="faq-field-error">请选择对应经历</span>}</label>}
                {group.binding === "unbound" && <label>分类<span className="faq-optional">可选</span><select value={group.category} onChange={(event) => updateGroup(group.id, { category: event.target.value })}><option value="">暂不设置</option>{faqCategories.map((category) => <option key={category}>{category}</option>)}</select></label>}
              </div>
            </div>
            <div className="faq-group-content">
              <div className="faq-group-tools"><label className="faq-select-all"><input type="checkbox" checked={group.cards.length > 0 && checked === group.cards.length} aria-label={`全选第 ${groupIndex + 1} 组 FAQ`} onChange={(event) => updateGroup(group.id, { cards: group.cards.map((card) => ({ ...card, selected: event.target.checked })) })} />全选</label><button className="secondary-button compact-button" type="button" aria-expanded={group.pasteOpen} onClick={() => updateGroup(group.id, { pasteOpen: !group.pasteOpen })}><ClipboardPaste size={15} />{group.pasteOpen ? "收起粘贴" : "批量粘贴"}</button></div>
              {group.pasteOpen && <div className="faq-paste-panel"><label>FAQ 文本<textarea rows={6} aria-invalid={showValidation && Boolean(group.raw.trim())} value={group.raw} onChange={(event) => updateGroup(group.id, { raw: event.target.value })} placeholder={"Q: 问题\nA: 答案\n\nQ: 下一个问题"} /></label>{showValidation && group.raw.trim() && <span className="faq-field-error">请先添加已粘贴的 FAQ</span>}{invalidBlocks.length > 0 && <p className="faq-field-error">{invalidBlocks.length} 条缺少问题，将跳过</p>}{group.raw.trim() && !parsed.length && <p className="faq-field-error">未识别到 Q: 问题</p>}{pasteTotal > 100 && <p className="faq-field-error">一次最多保存 100 条 FAQ</p>}<button className="primary-button" type="button" disabled={!parsedCount || pasteTotal > 100} onClick={() => applyPaste(group)}><Plus size={16} />添加 {parsedCount} 条</button></div>}
              <div className="faq-entry-cards">{group.cards.map((card, cardIndex) => <article className={`faq-entry-card${card.selected ? "" : " unselected"}`} key={card.id}>
                <div className="faq-entry-card-heading"><label><input type="checkbox" checked={card.selected} aria-label={`选择第 ${groupIndex + 1} 组 FAQ ${cardIndex + 1}`} onChange={(event) => updateCard(group.id, card.id, { selected: event.target.checked })} /><span>FAQ {cardIndex + 1}</span></label><button className="faq-entry-remove" type="button" aria-label={`移除第 ${groupIndex + 1} 组 FAQ ${cardIndex + 1}`} onClick={() => card.question.trim() || card.answer.trim() ? setRemoveTarget({ groupId: group.id, cardId: card.id }) : updateGroup(group.id, { cards: group.cards.filter((item) => item.id !== card.id) })}><Trash2 size={15} /></button></div>
                <label>问题<textarea rows={2} maxLength={10_000} data-focus-key={card.id} value={card.question} required={card.selected} aria-invalid={showValidation && card.selected && !card.question.trim()} onChange={(event) => updateCard(group.id, card.id, { question: event.target.value })} placeholder="输入问题" />{showValidation && card.selected && !card.question.trim() && <span className="faq-field-error">请填写问题</span>}</label>
                <label>答案<span className="faq-optional">可选</span><textarea rows={3} maxLength={100_000} value={card.answer} onChange={(event) => updateCard(group.id, card.id, { answer: event.target.value })} placeholder="输入答案" /></label>
              </article>)}</div>
              <button className="faq-add-card" type="button" disabled={total >= 100} onClick={() => appendCard(group)}><Plus size={18} />追加 FAQ</button>
            </div>
          </section>;
        })}
        <button className="faq-add-group" type="button" disabled={total >= 100} onClick={appendGroup}><LayersPlus size={18} />添加一组</button>
      </fieldset>
      <div className="faq-entry-footer">
        <div role="status" tabIndex={-1} data-invalid={showValidation && !selected}><strong>{groups.length}</strong> 组 · <strong>{selected}</strong> 条 FAQ</div>
        <button type="submit" className="primary-button" aria-busy={busy}>{busy ? "保存中…" : `保存全部 ${selected} 条 FAQ`}</button>
      </div>
      {showValidation && !selected && <p className="form-error" role="alert">请至少选择一条 FAQ</p>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
    </form>
    {choiceOpen && <FaqTaskDialog title="检查相似 FAQ？">{analysisError && <p className="form-error">{analysisError}</p>}<div className="faq-task-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => chooseImport(true)}>{busy ? "处理中…" : "使用 AI 分析"}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => chooseImport(false)}>直接保存</button><button className="faq-text-button" type="button" disabled={busy} onClick={() => setChoiceOpen(false)}>返回编辑</button></div></FaqTaskDialog>}
    {analysisId && <FaqImportProgress batchId={analysisId} onImported={handleImported} onReturnToEdit={handleReturnToEdit} />}
    {removeTarget && <FaqTaskDialog title={removeTarget.cardId ? "移除这条 FAQ？" : "移除这组 FAQ？"}><div className="modal-footer-actions"><button className="secondary-button" type="button" onClick={() => setRemoveTarget(null)}>取消</button><button className="danger-button" type="button" onClick={remove}>确认移除</button></div></FaqTaskDialog>}
  </>;
}

function focusField(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
}
