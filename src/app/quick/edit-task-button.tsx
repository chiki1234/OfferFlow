"use client";
import { useState, useTransition } from "react";
import { OperationModal } from "@/components/operation-modal";
import { TaskTimeFields } from "@/components/task-time-fields";
import { editQuickTaskAction } from "./actions";

export function EditQuickTaskButton({ task }: { task: { id: string; title: string; deadlineAt: string | null; startAt?: string | null; endAt?: string | null } }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  return <><button type="button" className="secondary-button compact-button" onClick={() => { setToken(crypto.randomUUID()); setError(""); setOpen(true); }}>编辑</button>{open && <OperationModal title="编辑待办" onClose={() => { if (!pending) setOpen(false); }}><form className="create-form" onSubmit={event => {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget); setError("");
    start(async () => { try { const result = await editQuickTaskAction(form); if (result.error) setError(result.error); else setOpen(false); } catch { setError("保存失败，请重试。"); } });
  }}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="idempotencyKey" value={token} /><fieldset className="job-editor-fields" disabled={pending}><label>待办内容<input name="title" required maxLength={255} defaultValue={task.title} /></label><TaskTimeFields task={task} /></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={pending}>{pending ? "保存中…" : "保存修改"}</button></form></OperationModal>}</>;
}
