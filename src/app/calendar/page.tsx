import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getShanghaiCalendarWeek } from "@/modules/workspace-queries/calendar-week";
import { getCurrentActor } from "@/shared/actor/current-actor";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const now = new Date();
  const week = getShanghaiCalendarWeek(now, first(params.week));
  const currentWeekKey = getShanghaiCalendarWeek(now).key;
  const actor = await getCurrentActor();
  const view = await getWorkspaceQueries().read(
    {
      type: "get_calendar_week",
      startAt: week.startAt,
      endAt: week.endAt,
    },
    actor,
  );
  return (
    <main className="page-stack">
      <nav className="calendar-navigation" aria-label="切换周"><Link className="secondary-button" href={`/calendar?week=${week.previousKey}`}><ChevronLeft size={16} />上一周</Link><div><strong>{formatWeekRange(week.startAt, week.endAt)}</strong>{week.key !== currentWeekKey && <Link href="/calendar">回到本周</Link>}</div><Link className="secondary-button" href={`/calendar?week=${week.nextKey}`}>下一周<ChevronRight size={16} /></Link></nav>
      {view.items.length === 0 ? (
        <section className="surface-card empty-state jobs-empty" style={{ marginTop: 40 }}>
          <span className="empty-icon"><CalendarDays size={22} /></span>
          <div><strong>还没有日历事项</strong><p>记录第一场面试或测评后，周视图会自动出现。</p></div>
        </section>
      ) : (
        <section className="calendar-list" aria-label="本周日程">
          {view.items.map((item) => (
            <article className={`surface-card calendar-item${item.hasConflict ? " conflict" : ""}`} key={`${item.sourceType}-${item.id}`}>
              <time>{formatDay(item.startAt)}<strong>{formatTime(item.startAt, item.isDeadline)}</strong></time>
              <div><span className={`calendar-kind ${item.sourceType}`}>{kindLabel(item.sourceType)}</span>{item.hasConflict && <span className="conflict-label">时间冲突</span>}<h2>{item.title}</h2><p>{item.companyName && item.roleName ? `${item.companyName} · ${item.roleName}` : "通用待办"}</p></div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function formatWeekRange(startAt: string, endAt: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" });
  return `${formatter.format(new Date(startAt))} – ${formatter.format(new Date(new Date(endAt).getTime() - 1))}`;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" });
function formatDay(value: string) { return dateFormatter.format(new Date(value)); }
function formatTime(value: string, deadline: boolean) { return deadline ? `截止 ${timeFormatter.format(new Date(value))}` : timeFormatter.format(new Date(value)); }
function kindLabel(kind: "interview" | "assessment" | "task") { return { interview: "面试", assessment: "测评", task: "待办" }[kind]; }
