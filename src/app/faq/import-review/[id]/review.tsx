"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, GitMerge, ListChecks, LoaderCircle, Plus, Search, SlidersHorizontal, Sparkles, Tag } from "lucide-react";
import type { getFaqImportReview } from "@/modules/interview-knowledge/faq-import";
import { prepareFaqMerge } from "@/modules/interview-knowledge/faq-merge";
import { confirmFaqImport, generateFaqAnswer } from "../../import-actions";
import styles from "./review.module.css";

type Review = Awaited<ReturnType<typeof getFaqImportReview>>;
type Draft = Review["items"][number];
type Choice = "merge" | "new";

export function FaqImportReview({ review }: { review: Review }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerSource, setAnswerSource] = useState<Record<string, string>>({});
  const [answerEditors, setAnswerEditors] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState(0);
  const groupSelect = useRef<HTMLSelectElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [, startGeneration] = useTransition();
  const groups = useMemo(() => review.targets.map((target) => ({
    target,
    items: review.items.filter((item) => review.matches.some((match) => match.incomingFaqId === item.id && match.existingFaqId === target.id)),
  })).filter((group) => group.items.length).sort((a, b) => review.items.indexOf(a.items[0]) - review.items.indexOf(b.items[0])), [review]);
  const matchedIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  const unmatched = review.items.filter((item) => !matchedIds.has(item.id));
  const mergedCount = Object.values(choices).filter((choice) => choice === "merge").length;
  const remaining = [...matchedIds].filter((id) => !choices[id]).length;
  const newCount = unmatched.length + Object.values(choices).filter((choice) => choice === "new").length;
  const anyGenerating = Object.values(generating).some(Boolean);
  const group = groups[activeGroup];
  const nextUndecided = groups.findIndex((candidate, index) => index !== activeGroup && candidate.items.some((item) => !choices[item.id]));

  function choose(items: Draft[], choice: Choice, resetAllAnswers = false) {
    const changed = new Set(items.filter((item) => choices[item.id] !== choice).map((item) => item.id));
    if (!changed.size && !resetAllAnswers) return;
    setChoices((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.id, choice])) }));
    const targetIds = groups.filter((candidate) => resetAllAnswers || candidate.items.some((item) => changed.has(item.id))).map((candidate) => candidate.target.id);
    setAnswers((current) => {
      const next = { ...current };
      targetIds.forEach((id) => delete next[id]);
      return next;
    });
    setAnswerSource((current) => ({ ...current, ...Object.fromEntries(targetIds.map((id) => [id, "existing"])) }));
    setGenerationErrors((current) => ({ ...current, ...Object.fromEntries(targetIds.map((id) => [id, ""])) }));
  }

  function generate(targetId: string, items: Draft[]) {
    setGenerating((current) => ({ ...current, [targetId]: true }));
    setGenerationErrors((current) => ({ ...current, [targetId]: "" }));
    startGeneration(async () => {
      try {
        const result = await generateFaqAnswer(review.id, targetId, items.map((item) => item.id));
        if (result.error) setGenerationErrors((current) => ({ ...current, [targetId]: result.error! }));
        else {
          setAnswers((current) => ({ ...current, [targetId]: result.answer! }));
          setAnswerSource((current) => ({ ...current, [targetId]: "ai" }));
        }
      } catch {
        setGenerationErrors((current) => ({ ...current, [targetId]: "生成失败，请重试；仍可使用已有答案。" }));
      } finally {
        setGenerating((current) => ({ ...current, [targetId]: false }));
      }
    });
  }

  function submit() {
    if (remaining || submitting || anyGenerating) return;
    setError(null);
    startSubmit(async () => {
      try {
        const result = await confirmFaqImport(review.id, {
          newItemIds: review.items.filter((item) => !matchedIds.has(item.id) || choices[item.id] === "new").map((item) => item.id),
          merges: groups.flatMap(({ target, items }) => {
            const selected = items.filter((item) => choices[item.id] === "merge");
            return selected.length ? [{ targetFaqId: target.id, itemIds: selected.map((item) => item.id), answer: answers[target.id] ?? target.answer, expectedUpdatedAt: target.updatedAt }] : [];
          }),
        });
        if (result.error) setError(result.error);
        else {
          router.replace(`/faq?imported=${result.result?.importedCount ?? 0}&merged=${result.result?.mergedCount ?? 0}`);
          router.refresh();
        }
      } catch {
        setError("确认导入失败，请重试。重复确认不会重复计数。");
      }
    });
  }

  function renderGroup({ target, items }: NonNullable<typeof group>) {
    const selected = items.filter((item) => choices[item.id] === "merge");
    const currentAnswer = answers[target.id] ?? target.answer;
    const source = answerSource[target.id] ?? "existing";
    const merged = selected.length ? prepareFaqMerge(target, selected, currentAnswer) : null;
    const decided = items.every((item) => choices[item.id]);
    const editorOpen = answerEditors[target.id] ?? false;
    const sourceLabel = source === "existing" ? "保留已有答案" : source === "ai" ? "使用 AI 合并答案" : source === "edited" ? "使用编辑后的答案" : "使用本次导入的答案";

    return <section className={styles.group} aria-label={`第 ${activeGroup + 1} 组相似问题`}>
      {groups.length > 1 && <div className={styles.groupNavigation}>
        <label className={styles.groupPicker}>
          <span>相似问题对照</span>
          <select ref={groupSelect} aria-label="跳转到相似问题分组" value={activeGroup} onChange={(event) => setActiveGroup(Number(event.target.value))}>
            {groups.map((candidate, index) => <option key={candidate.target.id} value={index}>{String(index + 1).padStart(2, "0")} · {candidate.items.every((item) => choices[item.id]) ? "已处理" : "待处理"} · {candidate.target.question.slice(0, 32)}</option>)}
          </select>
        </label>
        <div className={styles.pager}>
          <button className={styles.iconButton} aria-label="上一组" disabled={activeGroup === 0} onClick={() => setActiveGroup(activeGroup - 1)} type="button"><ChevronLeft size={18} /></button>
          <span>{activeGroup + 1} / {groups.length}</span>
          <button className={styles.iconButton} aria-label="下一组" disabled={activeGroup === groups.length - 1} onClick={() => setActiveGroup(activeGroup + 1)} type="button"><ChevronRight size={18} /></button>
        </div>
      </div>}
      <fieldset key={target.id} className={styles.groupBody} disabled={submitting || generating[target.id]} aria-label={`处理第 ${activeGroup + 1} 组`}>
        <div className={styles.pair}>
          <section className={`${styles.panel} ${styles.incoming}`}>
            <h2>本次导入的问题 {items.length > 1 && <span>{items.length} 条</span>}</h2>
            {items.map((item) => <article className={styles.incomingItem} key={item.id}>
              {items.length > 1 && <span className={styles.itemNumber}>问题 {review.items.indexOf(item) + 1}</span>}
              <h3 className={styles.question}>{item.question}</h3>
              <QuestionMeta item={item} frequency={1} />
              <AnswerPreview answer={item.answer} />
              <div className={styles.decisions} role="group" aria-label={`问题 ${review.items.indexOf(item) + 1} 的处理方式`}>
                <button aria-pressed={choices[item.id] === "merge"} className={`${styles.mergeButton} ${choices[item.id] === "new" ? styles.unselected : ""}`} onClick={() => choose([item], "merge")} type="button">
                  {choices[item.id] === "merge" ? <Check size={17} /> : <GitMerge size={17} />}{choices[item.id] === "merge" ? "已选择合并" : "合并到已有 FAQ"}
                </button>
                <button aria-pressed={choices[item.id] === "new"} className={styles.newButton} onClick={() => choose([item], "new")} type="button">
                  {choices[item.id] === "new" ? <Check size={17} /> : <Plus size={17} />}{choices[item.id] === "new" ? "已选择新建" : "作为新 FAQ"}
                </button>
              </div>
            </article>)}
          </section>
          <div className={styles.connector} aria-hidden="true"><span>发现相似</span><ArrowRight size={30} strokeWidth={1.5} /></div>
          <section className={styles.panel}>
            <h2>匹配到的已有 FAQ</h2>
            <h3 className={styles.question}>{target.question}</h3>
            <QuestionMeta item={target} frequency={target.frequency} existing />
            <AnswerPreview answer={target.answer} />
          </section>
        </div>
        {merged ? <section className={styles.mergePreview} aria-label="合并预览">
          <div className={styles.previewSummary}>
            <div className={styles.previewTitle}><GitMerge size={20} /><strong>合并预览</strong></div>
            <div className={styles.previewDetails}>
              <p>{sourceLabel}，保留全部来源面试</p>
              <div className={styles.frequency}><span>已有 <strong>{target.frequency}</strong> 次</span><Plus size={14} /><span>本次 <strong>{selected.length}</strong> 次</span><ArrowRight size={17} /><span className={styles.frequencyTotal}>合并后 <strong>{merged.frequency}</strong> 次</span></div>
            </div>
            <button className={styles.outlineButton} aria-expanded={editorOpen} aria-controls={`answer-editor-${target.id}`} onClick={() => setAnswerEditors((current) => ({ ...current, [target.id]: !editorOpen }))} type="button"><SlidersHorizontal size={16} />{editorOpen ? "收起详情" : "调整答案 / 查看详情"}<ChevronDown className={editorOpen ? styles.rotated : ""} size={15} /></button>
          </div>
          {editorOpen && <div className={styles.answerEditor} id={`answer-editor-${target.id}`}>
            <div className={styles.mergedQuestion}><span>合并后的问题</span><p>{merged.question}</p></div>
            <div className={styles.answerToolbar}><strong>最终答案</strong><button className={styles.outlineButton} onClick={() => generate(target.id, selected)} type="button"><Sparkles size={16} />AI 合并答案</button></div>
            <div className={styles.answerChoices} role="group" aria-label="选择答案来源">
              <button aria-pressed={source === "existing"} onClick={() => { setAnswers((current) => ({ ...current, [target.id]: target.answer })); setAnswerSource((current) => ({ ...current, [target.id]: "existing" })); }} type="button">已有答案</button>
              {selected.map((item) => <button aria-pressed={source === item.id} key={item.id} onClick={() => { setAnswers((current) => ({ ...current, [target.id]: item.answer })); setAnswerSource((current) => ({ ...current, [target.id]: item.id })); }} type="button">问题 {review.items.indexOf(item) + 1} 的答案</button>)}
              {source === "ai" && <span className={styles.answerStatus}><Sparkles size={14} />AI 合并版</span>}
            </div>
            <label className={styles.answerLabel}>可直接编辑，确认导入后保存<textarea rows={6} value={currentAnswer} onChange={(event) => { setAnswers((current) => ({ ...current, [target.id]: event.target.value })); setAnswerSource((current) => ({ ...current, [target.id]: "edited" })); }} /></label>
            <p className={styles.detailNote}>合并后沿用已有 FAQ 的经历与分类；问题表述去重保留。</p>
            {generationErrors[target.id] && <p className="form-error" role="alert">{generationErrors[target.id]}</p>}
          </div>}
        </section> : <div className={`${styles.decisionHint} ${decided ? styles.decisionReady : ""}`} role="status">
          {decided ? <Check size={19} /> : <GitMerge size={19} />}
          <span>{decided ? `本组 ${items.length} 条问题将独立保存为新 FAQ，各记 1 次出现。` : "对照两侧问题，选择合并到已有 FAQ，或作为新 FAQ 保存。"}</span>
        </div>}
      </fieldset>
      {generating[target.id] && <div className={styles.generationStatus} role="status"><LoaderCircle className="spin" size={17} />正在生成合并答案…{groups.length > 1 && "你可以切换到其他组继续处理。"}</div>}
      {groups.length > 1 && decided && nextUndecided >= 0 && <div className={styles.continueRow}><span><Check size={15} />本组已处理</span><button className={styles.outlineButton} onClick={() => { setActiveGroup(nextUndecided); groupSelect.current?.focus(); }} type="button">处理下一组待办<ArrowRight size={16} /></button></div>}
    </section>;
  }

  return <main className={styles.page}>
    <Link className={styles.backLink} href="/faq"><ArrowLeft size={17} />返回知识库</Link>
    <header className={styles.heading}>
      <div><h1>处理 AI 分析结果</h1><p>{matchedIds.size ? `发现 ${matchedIds.size} 条相似问题，选择处理方式后确认导入。` : "未发现相似问题，确认后将全部保存为新 FAQ。"}</p></div>
      {groups.length > 0 && <div className={styles.currentGroup}>当前对照<strong>{String(activeGroup + 1).padStart(2, "0")}<span> / {String(groups.length).padStart(2, "0")}</span></strong></div>}
    </header>
    <dl className={styles.summary}>
      <div><span className={styles.statIcon}><ListChecks size={21} /></span><div><dt>待处理相似项</dt><dd>{remaining}<span> 条</span></dd></div></div>
      <div><span className={styles.statIcon}><Search size={21} /></span><div><dt>无需合并</dt><dd>{unmatched.length}<span> 条</span></dd></div></div>
      <div><span className={styles.statIcon}><Check size={21} /></span><div><dt>本次导入</dt><dd>{review.items.length}<span> 条记录</span></dd></div></div>
    </dl>
    {matchedIds.size > 1 && <details className={styles.batchActions}>
      <summary><ListChecks size={16} />批量处理相似问题<ChevronDown size={15} /></summary>
      <div><button className={styles.outlineButton} disabled={submitting || anyGenerating} onClick={() => choose(groups.flatMap((candidate) => candidate.items), "merge", true)} type="button"><GitMerge size={15} />全部合并 · 保留已有答案</button><button className={styles.outlineButton} disabled={submitting || anyGenerating} onClick={() => choose(groups.flatMap((candidate) => candidate.items), "new", true)} type="button"><Plus size={15} />全部作为新 FAQ</button></div>
    </details>}
    {group && renderGroup(group)}
    {unmatched.length > 0 && <details className={styles.unmatched} open={groups.length === 0 ? true : undefined}>
      <summary><span className={styles.unmatchedIcon}><Check size={20} /></span><span><strong>{unmatched.length} 条问题将直接新建</strong><small>未发现相似项，无需逐条处理</small></span><span className={styles.disclosureLabel}>查看问题<ChevronDown size={17} /></span></summary>
      <div className={styles.unmatchedList}>{unmatched.map((item, index) => <article key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.question}</h3><AnswerPreview answer={item.answer} /></div></article>)}</div>
    </details>}
    <footer className={styles.submitBar} data-ready={remaining === 0}>
      <div className={styles.submitCopy} aria-live="polite"><strong>{remaining ? `还需处理 ${remaining} 条相似问题` : "已准备好导入"}</strong><span>新建 {newCount} 条 FAQ · 合并 {mergedCount} 次出现</span>{error && <p className="form-error" role="alert">{error}</p>}{anyGenerating && <span role="status">正在生成答案，请稍候…</span>}</div>
      <button className={styles.confirmButton} disabled={remaining > 0 || submitting || anyGenerating} onClick={submit} type="button">{submitting ? <><LoaderCircle className="spin" size={18} />正在保存…</> : <><Check size={18} />确认导入 {review.items.length} 条记录</>}</button>
    </footer>
  </main>;
}

function QuestionMeta({ item, frequency, existing = false }: { item: { experienceName: string | null; category: string | null; sourceInterviewLabel?: string }; frequency: number; existing?: boolean }) {
  return <div className={styles.questionMeta}><span><Tag size={15} />{item.experienceName ? `经历：${item.experienceName}` : `类别：${item.category ?? "未分类"}`}</span><span>{existing ? "已出现" : "本次"} <strong>{frequency}</strong> 次</span>{!existing && item.sourceInterviewLabel && <span>{item.sourceInterviewLabel}</span>}</div>;
}

function AnswerPreview({ answer }: { answer: string }) {
  if (!answer) return <span className={styles.emptyAnswer}>暂无答案</span>;
  return <details className={styles.answerPreview}><summary>查看答案<ChevronDown size={15} /></summary><p>{answer}</p></details>;
}
