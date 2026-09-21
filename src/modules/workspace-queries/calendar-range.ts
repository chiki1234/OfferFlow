import type { CalendarItem } from "./interface";
import { getShanghaiCalendarWeek } from "./calendar-week";

const DAY = 86400000;
export function shanghaiDay(value: Date | string) { return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function dayStart(day: string) { return new Date(`${day}T00:00:00+08:00`).getTime(); }
export function shiftDay(day: string, count: number) { return shanghaiDay(new Date(dayStart(day) + count * DAY)); }
export function calendarRange(now: Date, requested?: string, mode: "week" | "month" = "month") {
  const valid = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && Number.isFinite(dayStart(requested)) && shanghaiDay(new Date(dayStart(requested))) === requested;
  const selected = valid ? requested : shanghaiDay(now);
  if (mode === "week") {
    const week = getShanghaiCalendarWeek(now, selected);
    return { selected, first: week.key, days: 7, startAt: week.startAt, endAt: week.endAt, previous: shiftDay(selected, -7), next: shiftDay(selected, 7), label: `${week.key} — ${shiftDay(week.key, 6)}` };
  }
  const month = `${selected.slice(0,7)}-01`;
  const date = new Date(`${month}T00:00:00Z`);
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0,10);
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0,10);
  const first = getShanghaiCalendarWeek(now, month).key;
  const days = Math.ceil((dayStart(nextMonth) - dayStart(first)) / DAY / 7) * 7;
  return { selected, first, days, startAt: new Date(dayStart(first)).toISOString(), endAt: new Date(dayStart(first) + days * DAY).toISOString(), previous, next: nextMonth, label: `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月` };
}
export function itemsForDay(items: CalendarItem[], day: string) {
  const start = dayStart(day); const end = start + DAY;
  return items.filter(item => new Date(item.startAt).getTime() < end && (new Date(item.startAt).getTime() >= start || (item.endAt && new Date(item.endAt).getTime() > start)));
}
