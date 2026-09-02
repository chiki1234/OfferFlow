import Link from "next/link";
import { AlertTriangle, CalendarDays, CircleAlert, ClipboardCheck, Clock3 } from "lucide-react";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await getCurrentActor();
  const view = await getWorkspaceQueries().read(
    { type: "get_dashboard" },
    actor,
  );
  const reviewItems = view.todayItems.filter((item) => item.sourceType === "interview_review");

  return (
    <main className="page-stack">
      <section className="metric-grid" aria-label="求职进度概览">
        <MetricCard href="/jobs?tab=planned" label="待投递" value={view.counts.planned} tone="mint" />
        <MetricCard href="/jobs?tab=active" label="进行中" value={view.counts.active} tone="amber" />
        <MetricCard href="/jobs?tab=ended" label="已结束" value={view.counts.ended} tone="slate" />
      </section>

      <section className="dashboard-grid">
        <article className="surface-card action-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">今天要做</p>
            </div>
            <Clock3 size={20} />
          </div>
          {view.todayItems.length === 0 ? (
            <div className="empty-state compact">
              <span className="empty-icon"><CircleAlert size={20} /></span>
              <div><strong>暂时没有到期事项</strong></div>
            </div>
          ) : (
            <div className="agenda-list">
              {view.todayItems.map((item) => (
                <Link href={item.jobTrackId ? `/jobs/${item.jobTrackId}` : "/quick"} className="agenda-item" key={`${item.sourceType}-${item.id}`}>
                  <span className={item.overdue ? "agenda-dot overdue" : "agenda-dot"} />
                  <div><strong>{item.title}</strong><p>{item.companyName && item.roleName ? `${item.companyName} · ${item.roleName}` : "通用待办"}</p></div>
                  <time>{formatDateTime(item.dueAt)}</time>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="surface-card schedule-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">未来 7 天</p>
            </div>
            <CalendarDays size={20} />
          </div>
          {view.upcomingItems.length === 0 ? (
            <div className="empty-state compact">
              <span className="empty-icon"><CalendarDays size={20} /></span>
              <div><strong>本周还没有日程</strong></div>
            </div>
          ) : (
            <div className="agenda-list">
              {view.upcomingItems.map((item) => (
                <Link href={item.jobTrackId ? `/jobs/${item.jobTrackId}` : "/calendar"} className="agenda-item" key={`${item.sourceType}-${item.id}`}>
                  <span className={`agenda-dot ${item.sourceType}`} />
                  <div><strong>{item.title}</strong><p>{item.companyName && item.roleName ? `${item.companyName} · ${item.roleName}` : "通用待办"}</p></div>
                  <time>{formatDateTime(item.startAt)}</time>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="surface-card attention-panel">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">需要关注</p>
          </div>
          <AlertTriangle size={20} />
        </div>
        {view.attentionJobs.length === 0 && reviewItems.length === 0 ? (
          <div className="empty-state compact">
            <span className="empty-icon"><ClipboardCheck size={20} /></span>
            <div><strong>目前没有需要额外关注的岗位</strong></div>
          </div>
        ) : (
          <div className="attention-list">
            {view.attentionJobs.map((job) => (
              <Link className="attention-item" href={`/jobs/${job.id}`} key={job.id}>
                <div>
                  <strong>{job.companyName} · {job.roleName}</strong>
                  <p>{job.actionState === "action_required" ? "待行动" : "等待中"}</p>
                </div>
                <span>{job.attentionFlags.includes("overdue") ? "逾期" : "等待较久"}</span>
              </Link>
            ))}
            {reviewItems.map((item) => (
              <Link className="attention-item" href={`/interviews/${item.id}`} key={`review-${item.id}`}>
                <div>
                  <strong>{item.companyName} · {item.roleName}</strong>
                  <p>{item.title}</p>
                </div>
                <span>待复盘</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MetricCard({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  tone: "mint" | "amber" | "slate";
}) {
  return (
    <Link aria-label={`${label}，共 ${value} 个岗位`} className={`metric-card ${tone}`} href={href}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Link>
  );
}
