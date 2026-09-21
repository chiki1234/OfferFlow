import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { calendarRange, shanghaiDay } from "@/modules/workspace-queries/calendar-range";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { CalendarView } from "./calendar-view";
export const dynamic = "force-dynamic";
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const now = new Date();
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const mode = first(params.view) === "week" || (!params.view && params.week) ? "week" : "month";
  const range = calendarRange(now, first(params.date) ?? first(params.week), mode);
  const view = await getWorkspaceQueries().read({ type: "get_calendar_week", startAt: range.startAt, endAt: range.endAt }, await getCurrentActor());
  return <main className="page-stack page-stack-compact calendar-page"><CalendarView range={range} items={view.items} mode={mode} today={shanghaiDay(now)} /></main>;
}
