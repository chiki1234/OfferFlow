"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import { parseTimeInput } from "@/shared/time/parse-time-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export function DateTimeInput({ name, value, defaultValue, onChange, required, disabled, ...props }: Props) {
  const initial = String(value ?? defaultValue ?? "");
  const [draft, setDraft] = useState(initial.replace("T", " "));
  const [internal, setInternal] = useState(initial);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const normalized = value === undefined ? internal : String(value);
  const [previous, setPrevious] = useState(value);
  if (value !== previous) { setPrevious(value); setDraft(String(value ?? "").replace("T", " ")); }
  function commit(raw: string) {
    try {
      const result = parseTimeInput(raw, { selectedDate: normalized, deadline: name?.endsWith("deadlineAt") });
      setInternal(result); setDraft(result.replace("T", " ")); setError(""); input.current?.setCustomValidity("");
      onChange?.({ target: { value: result }, currentTarget: { value: result } } as React.ChangeEvent<HTMLInputElement>);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "请检查时间";
      setError(message); input.current?.setCustomValidity(message);
    }
  }
  return <span className="date-time-control">
    <input {...props} ref={input} type="text" required={required} disabled={disabled} value={draft} placeholder={props.placeholder ?? "例如：明天下午3点"} aria-invalid={Boolean(error)} onChange={event => { setDraft(event.target.value); event.target.setCustomValidity(""); setError(""); }} onBlur={event => commit(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(event.currentTarget.value); } }} />
    <input type="hidden" name={name} value={normalized} disabled={disabled} />
    <details><summary aria-label="选择日期时间">日历</summary><input aria-label="日历选择日期时间" type="datetime-local" value={normalized} disabled={disabled} onChange={event => commit(event.target.value)} /></details>
    {error ? <small role="alert" className="form-error">{error}</small> : normalized && <small>北京时间 {normalized.replace("T", " ")}</small>}
  </span>;
}
