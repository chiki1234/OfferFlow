"use client";

import { useState, useTransition } from "react";
import { saveAttentionDays } from "./attention-settings";

export function AttentionSettingsForm({ days }: { days: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return <form className="attention-settings" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      try { const result = await saveAttentionDays(form); setMessage(result.error ?? "已保存"); }
      catch { setMessage("保存失败，请重试。"); }
    });
  }}>
    <label>等待 <input aria-label="关注等待天数" name="days" type="number" min={1} max={365} step={1} defaultValue={days} required disabled={pending} /> 天后提醒</label>
    <button className="dashboard-outline-button" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
    {message && <span role="status">{message}</span>}
  </form>;
}
