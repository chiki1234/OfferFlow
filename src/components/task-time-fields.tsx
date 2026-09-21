"use client";
import { useState } from "react";
import { DateTimeInput } from "./date-time-input";

export function TaskTimeFields({ task, defaultDeadline = "" }: { task?: { deadlineAt: string | null; startAt?: string | null; endAt?: string | null }; defaultDeadline?: string }) {
  const [type, setType] = useState(task?.startAt ? "fixed_slot" : task?.deadlineAt || defaultDeadline ? "deadline" : "none");
  const local = (value?: string | null) => value ? new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16) : "";
  return <><label>时间设定<select name="timingType" value={type} onChange={event => setType(event.target.value)}><option value="none">不设时间</option><option value="deadline">Deadline</option><option value="fixed_slot">固定时段</option></select></label>{type === "deadline" && <label>截止时间<DateTimeInput name="deadlineAt" required defaultValue={local(task?.deadlineAt) || defaultDeadline} /></label>}{type === "fixed_slot" && <div className="form-row"><label>开始时间<DateTimeInput name="startAt" required defaultValue={local(task?.startAt)} /></label><label>结束时间<DateTimeInput name="endAt" required defaultValue={local(task?.endAt)} /></label></div>}</>;
}
