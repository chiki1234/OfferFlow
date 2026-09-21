"use client";
import { DateTimeInput } from "@/components/date-time-input";

import { useState } from "react";
import type { AssessmentView, ScheduledTiming } from "@/modules/job-workflow/interface";

export function InterviewTimeFields({ startAt = "", endAt = "" }: { startAt?: string; endAt?: string }) {
  const [start, setStart] = useState(startAt);
  const [end, setEnd] = useState(endAt);
  const [manual, setManual] = useState(false);
  return <><label>开始<DateTimeInput name="startAt"  required value={start} onChange={event => {
    const value = event.target.value; setStart(value);
    if (!manual) { const date = new Date(`${value}:00Z`); setEnd(value && !Number.isNaN(date.getTime()) ? new Date(date.getTime() + 3600000).toISOString().slice(0,16) : ""); }
  }} /></label><label>结束<DateTimeInput name="endAt"  required value={end} onChange={event => { setEnd(event.target.value); setManual(Boolean(event.target.value)); }} /></label></>;
}

export function ScheduledTimingFields({ timing, defaultType = "deadline" }: { timing?: ScheduledTiming; defaultType?: ScheduledTiming["type"] }) {
  const [timingType, setTimingType] = useState<ScheduledTiming["type"]>(timing?.type ?? defaultType);
  return <div className="form-row"><label>时间类型<select name="timingType" value={timingType} onChange={event => setTimingType(event.target.value as ScheduledTiming["type"])}><option value="deadline">Deadline</option><option value="fixed_slot">固定时段</option></select></label>{timingType === "deadline" ? <label>截止时间<DateTimeInput name="deadlineAt" required defaultValue={timing?.type === "deadline" ? localInput(timing.deadlineAt) : ""} /></label> : <InterviewTimeFields startAt={timing?.type === "fixed_slot" ? localInput(timing.startAt) : ""} endAt={timing?.type === "fixed_slot" ? localInput(timing.endAt) : ""} />}</div>;
}

export function AssessmentKindField({ value = "assessment" }: { value?: string }) { return <input name="assessmentKind" type="hidden" value={value} />; }

export function AssessmentFields({ assessment }: { assessment?: AssessmentView }) {
  return <><label>标题<input name="title" required defaultValue={assessment?.title} placeholder="例如：完成在线测评" /></label><label>测评链接（可选）<input name="assessmentUrl" type="url" placeholder="https://" defaultValue={assessment?.assessmentUrl ?? ""} /></label><ScheduledTimingFields timing={assessment?.timing} /></>;
}

export function InterviewFields() { return <><label>轮次<input name="roundLabel" placeholder="一面 / HR 沟通" required /></label><label>会议链接（可选）<input name="meetingUrl" type="url" placeholder="https://" /></label><ScheduledTimingFields defaultType="fixed_slot" /><label>备注（可选）<textarea name="notes" rows={3} /></label></>; }
function localInput(value: string) { return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0,16); }
