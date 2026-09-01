const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type CalendarWeekRange = {
  key: string;
  previousKey: string;
  nextKey: string;
  startAt: string;
  endAt: string;
};

export function getShanghaiCalendarWeek(now: Date, requestedDate?: string): CalendarWeekRange {
  const referenceDate = parseDateKey(requestedDate) ?? shanghaiDateOnly(now);
  const weekday = new Date(referenceDate).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = referenceDate - daysSinceMonday * DAY_MS;
  return {
    key: formatDateKey(monday),
    previousKey: formatDateKey(monday - 7 * DAY_MS),
    nextKey: formatDateKey(monday + 7 * DAY_MS),
    startAt: new Date(monday - SHANGHAI_OFFSET_MS).toISOString(),
    endAt: new Date(monday + 7 * DAY_MS - SHANGHAI_OFFSET_MS).toISOString(),
  };
}

function shanghaiDateOnly(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

function parseDateKey(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDateKey(timestamp) === value ? timestamp : null;
}

function formatDateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
