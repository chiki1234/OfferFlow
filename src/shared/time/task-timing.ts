import { localTimeToIso } from "./parse-time-input";
export function taskTimingFromForm(form: FormData) {
  const type = String(form.get("timingType") ?? (form.get("deadlineAt") ? "deadline" : "none"));
  if (type === "none") return { deadlineAt: undefined, startAt: undefined, endAt: undefined };
  if (type === "deadline") return { deadlineAt: localTimeToIso(String(form.get("deadlineAt") ?? "")), startAt: undefined, endAt: undefined };
  if (type === "fixed_slot") return { deadlineAt: undefined, startAt: localTimeToIso(String(form.get("startAt") ?? "")), endAt: localTimeToIso(String(form.get("endAt") ?? "")) };
  throw new Error("时间类型不正确");
}
