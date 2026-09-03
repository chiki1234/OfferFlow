"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GitMerge, LoaderCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import type { getFaqImportReview } from "@/modules/interview-knowledge/faq-import";
import { prepareFaqMerge } from "@/modules/interview-knowledge/faq-merge";
import { confirmFaqImport, generateFaqAnswer } from "../../import-actions";
import { FaqFrequency } from "../../faq-facts";

type Review = Awaited<ReturnType<typeof getFaqImportReview>>;
type Draft = Review["items"][number];
type Choice = "merge" | "new";

export function FaqImportReview({ review }: { review: Review }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerSource, setAnswerSource] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [, startGeneration] = useTransition();
  const groups = useMemo(() => review.targets.map((target) => ({ target, items: review.items.filter((item) => review.matches.some((match) => match.incomingFaqId === item.id && match.existingFaqId === target.id)) })).filter((group) => group.items.length).sort((a, b) => review.items.indexOf(a.items[0]) - review.items.indexOf(b.items[0])), [review]);
  const matchedIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  const unmatched = review.items.filter((item) => !matchedIds.has(item.id));
  const mergedCount = Object.values(choices).filter((choice) => choice === "merge").length;
  const remaining = [...matchedIds].filter((id) => !choices[id]).length;
  const newCount = unmatched.length + Object.values(choices).filter((choice) => choice === "new").length;
  const anyGenerating = Object.values(generating).some(Boolean);

  function choose(items: Draft[], choice: Choice, targetId?: string) {
    setChoices((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.id, choice])) }));
    const targetIds = targetId ? [targetId] : groups.map((group) => group.target.id);
    setAnswers((current) => { const next = { ...current }; targetIds.forEach((id) => delete next[id]); return next; });
    setAnswerSource((current) => ({ ...current, ...Object.fromEntries(targetIds.map((id) => [id, "existing"])) }));
  }

  function generate(targetId: string, items: Draft[]) {
    setGenerating((current) => ({ ...current, [targetId]: true }));
    setGenerationErrors((current) => ({ ...current, [targetId]: "" }));
    startGeneration(async () => {
      try {
        const result = await generateFaqAnswer(review.id, targetId, items.map((item) => item.id));
        if (result.error) setGenerationErrors((current) => ({ ...current, [targetId]: result.error! }));
        else { setAnswers((current) => ({ ...current, [targetId]: result.answer! })); setAnswerSource((current) => ({ ...current, [targetId]: "ai" })); }
      } catch { setGenerationErrors((current) => ({ ...current, [targetId]: "生成失败，请重试；仍可选择已有答案。" })); }
      finally { setGenerating((current) => ({ ...current, [targetId]: false })); }
    });
  }

  function submit() {
    setError(null);
    startSubmit(async () => {
      try {
        const result = await confirmFaqImport(review.id, {
          newItemIds: review.items.filter((item) => !matchedIds.has(item.id) || choices[item.id] === "new").map((item) => item.id),
          merges: groups.flatMap(({ target, items }) => {
            const merged = items.filter((item) => choices[item.id] === "merge");
            return merged.length ? [{ targetFaqId: target.id, itemIds: merged.map((item) => item.id), answer: answers[target.id] ?? target.answer, expectedUpdatedAt: target.updatedAt }] : [];
          }),
        });
        if (result.error) setError(result.error);
        else { router.replace(`/faq?imported=${result.result?.importedCount ?? 0}&merged=${result.result?.mergedCount ?? 0}`); router.refresh(); }
      } catch { setError("确认导入失败，请重试。重复确认不会重复计数。"); }
    });
  }

  return <main className="page-stack faq-review-page">
    <Link className="back-link" href="/faq"><ArrowLeft size={16} />稍后处理，返回知识库</Link>
    <header className="faq-review-heading"><div><p className="eyebrow">AI 已完成 · 等待你的决定</p><h1>让相似的问题，汇成一份积累。</h1><p>每组展示本次导入与对应的已有 FAQ。只有你确认后，合并和新增才会生效。</p></div><span className="faq-review-total">{review.items.length}<small>条待导入</small></span></header>
    <div className="faq-review-summary"><span><GitMerge size={17} /><strong>{matchedIds.size}</strong> 条发现相似项</span><span><Plus size={17} /><strong>{unmatched.length}</strong> 条未发现相似项</span><span><ShieldCheck size={17} />所有来源面试都会保留</span></div>
    {groups.length > 0 && <section className="faq-review-toolbar"><div><h2>逐组复核</h2><span>同一框内的新问题，都对应同一条已有 FAQ</span></div><div><button disabled={submitting || anyGenerating} onClick={() => choose(groups.flatMap((group) => group.items), "merge")} type="button">全部合并 · 保留已有答案</button><button disabled={submitting || anyGenerating} onClick={() => choose(groups.flatMap((group) => group.items), "new")} type="button">全部作为新 FAQ</button></div></section>}
    {groups.map(({ target, items }, index) => {
      const selected = items.filter((item) => choices[item.id] === "merge");
      const currentAnswer = answers[target.id] ?? target.answer;
      const merged = selected.length ? prepareFaqMerge(target, selected, currentAnswer) : null;
      return <section className="faq-review-group" key={target.id}>
        <header className="faq-review-group-heading"><span className="faq-group-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{target.experienceName ?? "未绑定经历"}</strong><small>{items.length} 条新问题 → 1 条已有 FAQ</small></div><span className="faq-group-status">{items.every((item) => choices[item.id]) ? <><Check size={14} />已决定</> : "等待决定"}</span></header>
        <fieldset className="faq-review-group-body" disabled={submitting || generating[target.id]}>
          <div className="faq-review-pair">
            <div className="faq-review-incoming"><div className="faq-column-label">本次导入 <span>{items.length} 条</span></div>{items.map((item) => <article className={`faq-review-card incoming ${choices[item.id] ?? "undecided"}`} key={item.id}><div className="faq-review-card-top"><span>新问题 {review.items.indexOf(item) + 1}</span><FaqFrequency count={1} /></div><h3>{item.question}</h3><AnswerPreview answer={item.answer} /><div className="faq-decision-options"><button aria-pressed={choices[item.id] === "merge"} className={choices[item.id] === "merge" ? "selected" : ""} onClick={() => choose([item], "merge", target.id)} type="button"><GitMerge size={14} />合并到已有</button><button aria-pressed={choices[item.id] === "new"} className={choices[item.id] === "new" ? "selected" : ""} onClick={() => choose([item], "new", target.id)} type="button"><Plus size={14} />作为新 FAQ</button></div></article>)}</div>
            <div aria-hidden className="faq-pair-connector"><span /><ArrowRight size={22} /><small>对应</small></div>
            <div className="faq-review-existing"><div className="faq-column-label">已有 FAQ <span>合并目标</span></div><article className="faq-review-card existing"><div className="faq-review-card-top"><span>{target.category ?? target.experienceName ?? "未分类"}</span><FaqFrequency count={target.frequency} /></div><h3>{target.question}</h3><AnswerPreview answer={target.answer} />{selected.length > 0 && <div className="faq-frequency-change"><span>{target.frequency} 次</span><ArrowRight size={15} /><strong>{target.frequency + selected.length} 次</strong><small>增加 {selected.length} 次出现</small></div>}</article><p className="faq-target-note">合并保留这条 FAQ 的经历与分类，新增来源面试关联；选择新建的问题则单独保存。</p></div>
          </div>
          {merged && <section className="faq-merge-preview"><div className="faq-merge-preview-heading"><div><GitMerge size={18} /><strong>合并后预览</strong><span>{selected.length} 条新问题已选择合并</span></div><button className="faq-ai-answer-button" onClick={() => generate(target.id, selected)} type="button"><Sparkles size={15} />AI 合并答案</button></div><p className="faq-merged-question">{merged.question}</p><div className="faq-answer-choices"><span>答案使用</span><button aria-pressed={(answerSource[target.id] ?? "existing") === "existing"} onClick={() => { setAnswers((current) => ({ ...current, [target.id]: target.answer })); setAnswerSource((current) => ({ ...current, [target.id]: "existing" })); }} type="button">已有答案</button>{selected.map((item) => <button aria-pressed={answerSource[target.id] === item.id} key={item.id} onClick={() => { setAnswers((current) => ({ ...current, [target.id]: item.answer })); setAnswerSource((current) => ({ ...current, [target.id]: item.id })); }} type="button">新问题 {review.items.indexOf(item) + 1} 的答案</button>)}{answerSource[target.id] === "ai" && <span className="faq-ai-result-label">AI 合并版</span>}</div><label className="faq-final-answer-label">最终答案 · 可直接编辑<textarea rows={6} value={currentAnswer} onChange={(event) => { setAnswers((current) => ({ ...current, [target.id]: event.target.value })); setAnswerSource((current) => ({ ...current, [target.id]: "edited" })); }} /></label>{generationErrors[target.id] && <p className="form-error">{generationErrors[target.id]}</p>}</section>}
        </fieldset>
        {generating[target.id] && <div className="faq-group-loading" role="status"><LoaderCircle className="spin" size={24} /><strong>正在生成合并答案…</strong><span>你可以继续复核其他组</span></div>}
      </section>;
    })}
    {unmatched.length > 0 && <section className="faq-unmatched-section"><header><div><p className="eyebrow">独立保存</p><h2>未发现相似项 · {unmatched.length} 条</h2><p>这些问题将作为新 FAQ 导入，初始均为 1 次。</p></div><Check size={24} /></header><div className="faq-unmatched-list">{unmatched.map((item, index) => <details key={item.id}><summary><span>{index + 1}</span><strong>{item.question}</strong><small>{item.experienceName ?? item.category ?? "未绑定经历"}</small></summary><p>{item.answer || "暂未记录答案"}</p></details>)}</div></section>}
    <footer className="faq-review-submit"><div><strong>{remaining ? `还有 ${remaining} 条相似项需要决定` : "已准备好导入"}</strong><span>新增 {newCount} 条 FAQ · 合并 {mergedCount} 次出现</span>{error && <p className="form-error">{error}</p>}</div><button className="primary-button" disabled={remaining > 0 || submitting || anyGenerating} onClick={submit} type="button">{submitting ? <><LoaderCircle className="spin" size={17} />正在保存…</> : <><Check size={17} />确认导入 {review.items.length} 条记录</>}</button></footer>
  </main>;
}

function AnswerPreview({ answer }: { answer: string }) {
  return <details className="faq-review-answer"><summary>{answer ? "查看答案" : "暂无答案"}</summary><p>{answer || "暂未记录答案"}</p></details>;
}
