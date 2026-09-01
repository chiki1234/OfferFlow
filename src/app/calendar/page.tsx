import { CalendarDays } from "lucide-react";
import { addDays, startOfWeek } from "date-fns";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const view = await getWorkspaceQueries().read(
    {
      type: "get_calendar_week",
      startAt: weekStart.toISOString(),
      endAt: weekEnd.toISOString(),
    },
    getCurrentActor(),
  );
  return (
    <main className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">周视图</p>
          <h1>所有硬时间，一个地方看清。</h1>
          <p className="page-description">面试、固定笔试和 Deadline 会直接从业务对象汇总到这里。</p>
        </div>
      </header>
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
              <div><span className={`calendar-kind ${item.sourceType}`}>{kindLabel(item.sourceType)}</span>{item.hasConflict && <span className="conflict-label">时间冲突</span>}<h2>{item.title}</h2><p>{item.companyName} · {item.roleName}</p></div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" });
function formatDay(value: string) { return dateFormatter.format(new Date(value)); }
function formatTime(value: string, deadline: boolean) { return deadline ? `截止 ${timeFormatter.format(new Date(value))}` : timeFormatter.format(new Date(value)); }
function kindLabel(kind: "interview" | "assessment" | "task") { return { interview: "面试", assessment: "测评", task: "待办" }[kind]; }
