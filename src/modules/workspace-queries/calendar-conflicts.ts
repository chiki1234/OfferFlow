import type { CalendarItem } from "./interface";

export function markCalendarConflicts(items: CalendarItem[]): CalendarItem[] {
  return items.map((item, index) => ({
    ...item,
    hasConflict: hasTimedOverlap(item, items, index),
  }));
}

function hasTimedOverlap(item: CalendarItem, items: CalendarItem[], index: number) {
  if (item.isDeadline || !item.endAt) return false;
  const start = new Date(item.startAt).getTime();
  const end = new Date(item.endAt).getTime();
  return items.some((candidate, candidateIndex) => {
    if (candidateIndex === index || candidate.isDeadline || !candidate.endAt) return false;
    return start < new Date(candidate.endAt).getTime() && new Date(candidate.startAt).getTime() < end;
  });
}
