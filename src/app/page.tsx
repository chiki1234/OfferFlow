import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CircleAlert, ClipboardCheck, Clock3 } from "lucide-react";
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
      <header className="page-heading">
        <div>
          <p className="eyebrow">行动首页</p>
          <h1>早上好，先处理最重要的事。</h1>
          <p className="page-description">工作台会把任务、硬时间和需要关注的岗位放在一起。</p>
        </div>
        <Link className="primary-button" href="/jobs?tab=planned">
          新增待投递 <ArrowRight size={17} />
        </Link>
      </header>

      <section className="metric-grid" aria-label="求职进度概览">
        <MetricCard label="待投递" value={view.counts.planned} hint="明确准备投递" tone="mint" />
        <MetricCard label="进行中" value={view.counts.active} hint="正在推进" tone="amber" />
        <MetricCard label="已结束" value={view.counts.ended} hint="保留完整上下文" tone="slate" />
      </section>

      <section className="dashboard-grid">
        <article className="surface-card action-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">今天要做</p>
              <h2>行动队列</h2>
            </div>
            <Clock3 size={20} />
          </div>
          {view.todayItems.length === 0 ? (
            <div className="empty-state compact">
              <span className="empty-icon"><CircleAlert size={20} /></span>
              <div><strong>暂时没有到期事项</strong><p>记录测评或面试后，这里会自动出现下一步。</p></div>
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
              <h2>近期日程</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          {view.upcomingItems.length === 0 ? (
            <div className="empty-state compact">
              <span className="empty-icon"><CalendarDays size={20} /></span>
              <div><strong>本周还没有硬时间</strong><p>面试、固定笔试和 Deadline 会汇总到这里。</p></div>
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
            <h2>别让重要进展沉下去</h2>
          </div>
          <AlertTriangle size={20} />
        </div>
        {view.attentionJobs.length === 0 && reviewItems.length === 0 ? (
          <div className="empty-state compact">
            <span className="empty-icon"><ClipboardCheck size={20} /></span>
            <div><strong>目前没有需要额外关注的岗位</strong><p>等待较久、逾期和待复盘事项会自动汇总到这里。</p></div>
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
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "mint" | "amber" | "slate";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
