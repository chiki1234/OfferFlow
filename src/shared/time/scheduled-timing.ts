import type { ScheduledTiming } from "@/modules/job-workflow/interface";
import { formTimeToIso } from "./parse-time-input";

export function scheduledTimingFromForm(form: FormData): ScheduledTiming {
  const type = String(form.get("timingType") ?? "fixed_slot");
  if (type === "deadline") {
    return {
      type: "deadline",
      deadlineAt: formTimeToIso(String(form.get("deadlineAt") ?? "")),
    };
  }
  if (type === "fixed_slot") {
    return {
      type: "fixed_slot",
      startAt: formTimeToIso(String(form.get("startAt") ?? "")),
      endAt: formTimeToIso(String(form.get("endAt") ?? "")),
    };
  }
  throw new Error("时间类型不正确");
}
