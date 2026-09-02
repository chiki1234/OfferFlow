import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, FileCheck2 } from "lucide-react";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { getResumeOptions } from "@/modules/resume-library/queries";
import { getExperienceOptions } from "@/modules/interview-knowledge/queries";
import type { JobTrackListItem } from "@/modules/workspace-queries/interface";
import { DeletePlannedJobButton, JobsPageActions } from "./jobs-page-actions";

export const dynamic = "force-dynamic";

const lifecycleTabs = [
  { key: "planned", label: "待投递" },
  { key: "active", label: "进行中" },
  { key: "ended", label: "已结束" },
] as const;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const selected = lifecycleTabs.some((tab) => tab.key === params.tab)
    ? (params.tab as (typeof lifecycleTabs)[number]["key"])
    : "planned";
  const actor = await getCurrentActor();
  const [view, resumes, experiences] = await Promise.all([
    getWorkspaceQueries().read({ type: "list_job_tracks", lifecycle: selected }, actor),
    getResumeOptions(actor.userId),
    getExperienceOptions(actor.userId),
  ]);

  return (
    <main className="page-stack">
      <div className="jobs-layout">
        <section className="jobs-list-panel">
          <div className="jobs-tab-toolbar">
            <nav className="tab-list" aria-label="岗位生命周期">
              {lifecycleTabs.map((tab) => (
                <Link
                  className={selected === tab.key ? "active" : undefined}
                  href={`/jobs?tab=${tab.key}`}
                  key={tab.key}
                >
                  {tab.label}
                  <span>{view.counts[tab.key]}</span>
                </Link>
              ))}
            </nav>
            <JobsPageActions experiences={experiences} resumes={resumes} tokens={{ create: randomUUID(), quickImport: randomUUID() }} />
          </div>

          <div className="job-card-list">
            {view.items.length === 0 ? (
              <div className="surface-card empty-state jobs-empty">
                <span className="empty-icon"><BriefcaseBusiness size={22} /></span>
                <div>
                  <strong>这个列表还是空的</strong>
                  <p>{selected === "planned" ? "把已经明确想投的岗位先放进来。" : "发生新的招聘进展后会自动归入这里。"}</p>
                </div>
              </div>
            ) : selected === "active" ? (
              <>
                <JobGroup label="待行动" hint="有明确下一步需要完成" items={view.items.filter((job) => job.actionState === "action_required")} />
                <JobGroup label="等待中" hint="当前步骤已完成，等待公司进展" items={view.items.filter((job) => job.actionState === "waiting")} />
              </>
            ) : view.items.map((job) => <JobCard job={job} key={job.id} />)}
          </div>
        </section>
      </div>
    </main>
  );
}

function JobGroup({ label, hint, items }: { label: string; hint: string; items: JobTrackListItem[] }) {
  if (items.length === 0) return null;
  return <section className="job-group">
    <div className="job-group-heading"><div><h2>{label}</h2><p>{hint}</p></div><span>{items.length}</span></div>
    <div className="job-group-list">{items.map((job) => <JobCard job={job} key={job.id} />)}</div>
  </section>;
}

function JobCard({ job }: { job: JobTrackListItem }) {
  return <article className="job-card">
    <Link className="job-card-heading" href={`/jobs/${job.id}`}>
      <div><span className="company-name">{job.companyName}</span><h2>{job.roleName}</h2></div>
      <ArrowUpRight size={19} />
    </Link>
    <div className="job-meta-row">
      <span className={job.hasJobDescription ? "complete" : "missing"}><FileCheck2 size={15} /> {job.hasJobDescription ? "JD 已保存" : "待补充 JD"}</span>
      <span>{job.lifecycle === "planned" ? "尚未投递" : job.hasResume ? "已绑定简历" : "待补充简历"}</span>
      {job.actionState === "action_required" && <span className="job-action-state">待行动 · {job.currentNext.title}</span>}
      {job.actionState === "waiting" && <span>等待中 · {job.currentNext.detail}</span>}
      {job.attentionFlags.includes("overdue") && <span className="job-attention">有逾期事项</span>}
      {job.attentionFlags.includes("waiting_long") && <span className="job-attention">等待较久</span>}
      {job.lifecycle === "ended" && <span>{endReasonLabel(job.endReason)}{job.endedAt ? ` · ${formatDate(job.endedAt)}` : ""}</span>}
    </div>
    {job.lifecycle === "planned" && <div className="job-card-footer"><DeletePlannedJobButton jobLabel={`${job.companyName} · ${job.roleName}`} jobTrackId={job.id} token={randomUUID()} /></div>}
  </article>;
}

function endReasonLabel(reason: string | null) {
  return { rejected: "明确拒绝", withdrawn: "主动结束", inactive: "流程失活", other: "其他原因" }[reason ?? ""] ?? "已结束";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}
