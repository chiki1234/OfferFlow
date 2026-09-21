import { eventLabel, eventDetail } from "@/modules/workspace-queries/event-display";
import { RecordJobProgressButton } from "./[id]/job-actions-panel";
import { JobsSearch } from "./jobs-search";
import { EditJobButton } from "./edit-job-button";
import { getCompanyOptions } from "@/modules/workspace-queries/company-options";
import { groupCompanyJobs, preferenceLabel } from "@/modules/workspace-queries/company-groups";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import "./jobs.css";
import { FileText, Download, CalendarClock, BriefcaseBusiness } from "lucide-react";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { getResumeOptions } from "@/modules/resume-library/queries";
import { getExperienceOptions } from "@/modules/interview-knowledge/queries";
import type { JobTrackListItem } from "@/modules/workspace-queries/interface";
import { AddPreferenceButton, JobsPageActions, type JobCreationOptions } from "./jobs-page-actions";

export const dynamic = "force-dynamic";

const lifecycleTabs = [
  { key: "planned", label: "待投递" },
  { key: "active", label: "进行中" },
  { key: "ended", label: "已结束" },
] as const;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const selected = lifecycleTabs.some((tab) => tab.key === params.tab)
    ? (params.tab as (typeof lifecycleTabs)[number]["key"])
    : "planned";
  const query = (params.q ?? "").trim().toLocaleLowerCase();
  const actor = await getCurrentActor();
  const [view, resumes, experiences, companies] = await Promise.all([
    getWorkspaceQueries().read({ type: "list_job_tracks", ...(query ? {} : { lifecycle: selected }) }, actor),
    getResumeOptions(actor.userId),
    getExperienceOptions(actor.userId),
    getCompanyOptions(actor.userId),
  ]);
  const items = view.items.filter(job => !query || job.companyName.toLocaleLowerCase().includes(query) || job.roleName.toLocaleLowerCase().includes(query));
  const creationOptions: JobCreationOptions = { companies, resumes, experiences, creationMode: selected === "active" ? "active" : "planned" };

  return (
    <main className="page-stack jobs-page">
      <header className="jobs-heading"><div><h1>求职进度</h1><p>每一次投递，每一步进展。</p></div><span>{view.counts.planned + view.counts.active + view.counts.ended} 个岗位</span></header>
      <div className="jobs-layout">
        <section className="jobs-list-panel">
          <div className="jobs-tab-toolbar">
            <JobsSearch query={params.q ?? ""} tab={selected} counts={view.counts} />
            <JobsPageActions {...creationOptions} tokens={{ create: randomUUID(), quickImport: randomUUID() }} />
          </div>

          <div className="job-card-list">
            {items.length === 0 ? (
              <div className="surface-card empty-state jobs-empty">
                <span className="empty-icon"><BriefcaseBusiness size={22} /></span>
                <div>
                  <strong>{query ? "没有匹配的岗位" : "这个列表还是空的"}</strong>
                  <p>{query ? "试试其他公司名称或岗位名称。" : selected === "planned" ? "把已经明确想投的岗位先放进来。" : "发生新的招聘进展后会自动归入这里。"}</p>
                </div>
              </div>
            ) : !query && selected === "active" ? (
              <>
                <JobGroup creationOptions={creationOptions} label="待行动" hint="有明确下一步需要完成" items={groupCompanyJobs(items).filter(group => group.actionRequired).flatMap(group => group.items)} />
                <JobGroup creationOptions={creationOptions} label="等待中" hint="当前步骤已完成，等待公司进展" items={groupCompanyJobs(items).filter(group => !group.actionRequired).flatMap(group => group.items)} />
              </>
            ) : <JobsTable items={items} creationOptions={creationOptions} />}
          </div>
        <footer className="jobs-count">{query ? "搜索结果" : "当前列表"} · {items.length} 个岗位</footer>
        </section>
      </div>
    </main>
  );
}

function JobGroup({ label, hint, items, creationOptions }: { label: string; hint: string; items: JobTrackListItem[]; creationOptions: JobCreationOptions }) {
  if (items.length === 0) return null;
  return <section className="job-group">
    <div className="job-group-heading"><div><h2>{label}</h2><p>{hint}</p></div><span>{items.length}</span></div>
    <JobsTable items={items} creationOptions={creationOptions} />
  </section>;
}

function JobsTable({ items, creationOptions }: { items: JobTrackListItem[]; creationOptions: JobCreationOptions }) {
  return <div className="jobs-board">
    <div className="jobs-columns" aria-hidden="true">{["公司 / 岗位", "状态 / 投递时间", "岗位资料", "当前进度", "下一步 / 提醒", "操作"].map(label => <span key={label}>{label}</span>)}</div>
    {groupCompanyJobs(items).map(group => <section className="jobs-company" key={group.name} aria-label={group.name}>
      {group.items.map((job, index) => <article className={`jobs-row ${job.actionState === "action_required" ? "needs-action" : ""}`} key={job.id}>
        <div className="jobs-identity">
          <Link className="jobs-company-name" href={`/jobs/${job.id}`} scroll={false}>{group.name}</Link>
          {job.jobUrl ? <a className="jobs-role" href={job.jobUrl} target="_blank" rel="noreferrer">{job.roleName} ↗</a> : <strong className="jobs-role">{job.roleName}</strong>}
          <div className="jobs-tags">{job.department && <span>{job.department}</span>}{job.preferenceRank && <span>{preferenceLabel(job.preferenceRank)}</span>}</div>
          {index === 0 && <AddPreferenceButton {...creationOptions} companyName={group.name} />}
        </div>
        <div className="jobs-status-cell"><span className={`jobs-status ${job.lifecycle}`}>{job.lifecycle === "planned" ? "待投递" : job.lifecycle === "ended" ? "已结束" : "进行中"}</span><time>{job.submittedAt ? formatDate(job.submittedAt) : "尚未投递"}</time></div>
        <div className="jobs-resources">
          {job.hasJobDescription ? <Link scroll={false} href={`/jobs/${job.id}#job-description`}><FileText size={17} />查看 JD</Link> : <span className="jobs-muted">JD 待补充</span>}
          {job.selectedResume ? <a href={`/api/assets/${job.selectedResume.assetId}?download=1`} download><Download size={15} /><span>{job.selectedResume.name}</span></a> : <span className="jobs-muted">未关联简历</span>}
        </div>
        <div className="jobs-progress">
          <strong>{job.latestEvent ? eventLabel(job.latestEvent.kind) : job.currentNext.title}</strong>
          {job.latestEvent && <><p>{eventDetail(job.latestEvent.kind, job.latestEvent.payload)}</p><small>{formatDate(job.latestEvent.occurredAt)}</small></>}
          {!!job.milestones?.length && <details className="jobs-history"><summary>笔面试记录 · {job.milestones.length}</summary><ol>{job.milestones.map(item => <li key={item.id}><Link scroll={false} href={item.href}>{item.title}</Link><small>{item.status}</small><small>{formatSchedule(item)}</small></li>)}</ol></details>}
        </div>
        <div className="jobs-next-cell">
          <Link className={`jobs-next ${job.currentNext.state}`} href={`/jobs/${job.id}`} scroll={false}>
            {job.currentNext.state === "action_required" && <CalendarClock size={19} />}
            <span><strong>{job.currentNext.title}</strong><small>{job.currentNext.detail}</small>{job.currentNext.scheduledAt && <small>{formatDateTime(job.currentNext.scheduledAt)}</small>}</span>
          </Link>
          {!!job.attentionFlags.length && <div className="jobs-alerts">{job.attentionFlags.includes("overdue") && <span>有事项逾期</span>}{job.attentionFlags.includes("waiting_long") && <span>等待较久</span>}</div>}
          {job.lifecycle !== "ended" && !!job.pendingTasks?.length && <details className="jobs-history"><summary>待办 · {job.pendingTasks.length}</summary><ol>{job.pendingTasks.map(item => <li key={item.id}><Link scroll={false} href={`/jobs/${job.id}#task-${item.id}`}>{item.title}</Link><small>{formatSchedule(item)}</small></li>)}</ol></details>}
        </div>
        <div className="jobs-row-actions">{job.lifecycle !== "ended" && <RecordJobProgressButton jobTrackId={job.id} token={randomUUID()} />}<div><EditJobButton jobTrackId={job.id} /><Link className="jobs-detail-link" href={`/jobs/${job.id}`} scroll={false}>详情 ↗</Link></div></div>
      </article>)}
    </section>)}
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatSchedule(item: { at: string | null; endAt?: string | null; timingType?: string }) {
  if (!item.at) return "未设置时间";
  if (item.timingType === "deadline") return `截止 ${formatDateTime(item.at)}`;
  return `${formatDateTime(item.at)}${item.endAt ? ` — ${formatDateTime(item.endAt)}` : ""}`;
}
