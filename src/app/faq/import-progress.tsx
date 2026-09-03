"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { confirmFaqImport, retryFaqAnalysis } from "./import-actions";
import { withFaqRequestTimeout } from "./import-request";

const MAX_CONNECTION_RETRIES = 3;

export function FaqTaskDialog({ children, title }: { children: React.ReactNode; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const preventEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("keydown", preventEscape, true);
    return () => { dialog?.close(); window.removeEventListener("keydown", preventEscape, true); };
  }, []);
  return <dialog aria-labelledby={titleId} className="faq-task-dialog" onCancel={(event) => event.preventDefault()} ref={ref}><h2 id={titleId}>{title}</h2>{children}</dialog>;
}

export function FaqImportProgress({ batchId, onImported, onReturnToEdit }: { batchId: string; onImported?: () => void; onReturnToEdit?: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectionRetries, setConnectionRetries] = useState(0);
  const [version, setVersion] = useState(0);
  const [progress, setProgress] = useState({ completedCount: 0, totalCount: 0 });
  const [busy, startTransition] = useTransition();
  const pollingPaused = useRef(false);
  const finished = status === "completed" || status === "review" || status === "editing";
  const importing = status === "importing";
  const pollEnabled = !finished && !importing && status !== "failed";
  useEffect(() => {
    if (!pollEnabled) return;
    let stopped = false;
    let consecutiveFailures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const lifecycle = new AbortController();
    async function poll() {
      try {
        const data = await withFaqRequestTimeout(async (signal) => {
          const response = await fetch(`/api/faq/import-batches/${batchId}`, { cache: "no-store", signal });
          if (!response.ok) throw new Error("connection");
          const value = await response.json() as { status: string; error: string | null; completedCount: number; totalCount: number };
          if (!["pending", "analyzing", "review", "failed", "completed"].includes(value.status)) throw new Error("invalid status");
          if (value.status === "pending" && !signal.aborted && !stopped && !pollingPaused.current) {
            const started = await fetch(`/api/faq/import-batches/${batchId}`, { method: "POST", signal });
            if (!started.ok) throw new Error("connection");
          }
          return value;
        }, lifecycle.signal);
        if (stopped || pollingPaused.current) return;
        consecutiveFailures = 0;
        setStatus(data.status); setError(data.error); setConnectionRetries(0);
        setProgress({ completedCount: data.completedCount, totalCount: data.totalCount });
        if (data.status === "review") { pollingPaused.current = true; router.replace(`/faq/import-review/${batchId}`); router.refresh(); return; }
        if (data.status === "completed") { pollingPaused.current = true; onImported?.(); router.replace("/faq"); router.refresh(); return; }
        if (data.status === "failed") { pollingPaused.current = true; return; }
      } catch {
        if (stopped || pollingPaused.current) return;
        consecutiveFailures++;
        if (consecutiveFailures > MAX_CONNECTION_RETRIES) {
          pollingPaused.current = true;
          setConnectionRetries(0);
          setError("连接恢复失败，已重试 3 次。");
          setStatus("failed");
          return;
        }
        setConnectionRetries(consecutiveFailures);
      }
      if (!stopped && !pollingPaused.current) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); lifecycle.abort(); };
  }, [batchId, router, version, pollEnabled, onImported]);

  function retry() {
    if (busy) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await withFaqRequestTimeout(() => retryFaqAnalysis(batchId));
        if (result.error) setActionError(result.error);
        else { pollingPaused.current = false; setStatus("pending"); setError(null); setConnectionRetries(0); setVersion((value) => value + 1); }
      } catch { setActionError("暂时无法重新分析，请检查连接后重试。内容仍然保留。"); }
    });
  }
  function importWithoutAi() {
    if (busy || status !== "failed") return;
    // Ignore in-flight analysis polls before the import action can resolve.
    pollingPaused.current = true;
    setStatus("importing");
    setConnectionRetries(0);
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await withFaqRequestTimeout(() => confirmFaqImport(batchId, { newItemIds: [], merges: [] }, true));
        if (result.error) {
          pollingPaused.current = true;
          setStatus("failed");
          setActionError(result.error);
        } else {
          setStatus("completed");
          onImported?.();
          router.replace(`/faq?imported=${result.result?.importedCount ?? 0}&merged=0`);
          router.refresh();
        }
      } catch {
        pollingPaused.current = true;
        setStatus("failed");
        setActionError("暂时无法确认导入结果，请稍后重试，或返回编辑。重复确认不会重复导入。");
      }
    });
  }
  function returnToEdit() {
    pollingPaused.current = true;
    setStatus("editing");
    onReturnToEdit?.();
  }
  if (finished) return null;
  const failed = status === "failed";
  return <FaqTaskDialog title={importing ? "正在导入 FAQ" : failed ? "这次分析未能完成" : "AI 分析中"}>
    <div className={`faq-task-symbol ${failed ? "failed" : ""}`}>{failed ? <TriangleAlert size={30} /> : <Sparkles size={30} />}</div>
    {!importing && <p className="eyebrow">FAQ 智能识别</p>}
    <p>{importing ? "正在保存 FAQ，请稍候。" : failed ? actionError ?? error : "预计需要 1～2 分钟，请勿退出当前页面。"}</p>
    {!importing && progress.totalCount > 0 && <p className="faq-task-note" role="status">已完成 {progress.completedCount} / {progress.totalCount} 条{failed ? "，重试将从未完成的问题继续。" : ""}</p>}
    {!failed && <>{!importing && <><div className="faq-analysis-progress"><span /></div><p className="faq-task-note">正在同一经历范围内寻找相似FAQ。</p></>}<LoaderCircle aria-hidden className="spin" size={20} /></>}
    {connectionRetries > 0 && <p className="form-error">连接暂时中断，正在重试（{connectionRetries}/{MAX_CONNECTION_RETRIES}）…</p>}
    {failed && <div className="faq-task-actions"><button className="primary-button" disabled={busy} onClick={retry} type="button">{busy ? "处理中…" : "重新分析"}</button><button className="secondary-button" disabled={busy} onClick={importWithoutAi} type="button">跳过 AI，确认全部作为新 FAQ 导入</button>{onReturnToEdit && <button className="faq-text-button" disabled={busy} onClick={returnToEdit} type="button">返回编辑</button>}</div>}
  </FaqTaskDialog>;
}
