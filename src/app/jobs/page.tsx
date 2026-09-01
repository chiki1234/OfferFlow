import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, FileCheck2 } from "lucide-react";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { CreateJobForm } from "./create-job-form";

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
  const view = await getWorkspaceQueries().read(
    { type: "list_job_tracks", lifecycle: selected },
    getCurrentActor(),
  );

  return (
    <main className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">求职推进</p>
          <h1>每个岗位，现在走到哪里？</h1>
          <p className="page-description">不预设固定招聘流程，只保存事实和下一步行动。</p>
        </div>
      </header>

      <div className="jobs-layout">
        <section className="jobs-list-panel">
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

          <div className="job-card-list">
            {view.items.length === 0 ? (
              <div className="surface-card empty-state jobs-empty">
                <span className="empty-icon"><BriefcaseBusiness size={22} /></span>
                <div>
                  <strong>这个列表还是空的</strong>
                  <p>{selected === "planned" ? "把已经明确想投的岗位先放进来。" : "发生新的招聘进展后会自动归入这里。"}</p>
                </div>
              </div>
            ) : (
              view.items.map((job) => (
                <Link className="job-card" href={`/jobs/${job.id}`} key={job.id}>
                  <div className="job-card-heading">
                    <div>
                      <span className="company-name">{job.companyName}</span>
                      <h2>{job.roleName}</h2>
                    </div>
                    <ArrowUpRight size={19} />
                  </div>
                  <div className="job-meta-row">
                    <span className={job.hasJobDescription ? "complete" : "missing"}>
                      <FileCheck2 size={15} /> {job.hasJobDescription ? "JD 已保存" : "待补充 JD"}
                    </span>
                    <span>{job.lifecycle === "planned" ? "尚未投递" : job.hasResume ? "已绑定简历" : "待补充简历"}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <aside className="surface-card form-panel">
          <CreateJobForm idempotencyKey={randomUUID()} />
        </aside>
      </div>
    </main>
  );
}
