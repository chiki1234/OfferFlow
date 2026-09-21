"use client";

import { AttentionSettingsForm } from "./attention-settings-form";
import { CompanyJobSearch } from "@/components/company-job-search";
import { eventLabel, eventDetail } from "@/modules/workspace-queries/event-display";
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { OperationModal } from "@/components/operation-modal";
import {
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Send,
  Sprout,
} from "lucide-react";
import type {
  CalendarItem,
  DashboardActionItem,
  DashboardView,
  JobTrackListItem,
} from "@/modules/workspace-queries/interface";
import {
  dateParts,
  fullDateTime,
  greeting,
  relativeTime,
} from "./dashboard-format";
import {
  DashboardProgressModal,
  DashboardTaskModal,
  type DashboardJobOption,
} from "./dashboard-forms";

export type DashboardActionState = {
  error: string | null;
  success: string | null;
};
export type DashboardFormAction = (
  state: DashboardActionState,
  form: FormData,
) => Promise<DashboardActionState>;
export type DashboardProps = {
  waitingDays?: number;
  view: DashboardView;
  displayName: string;
  now: string;
  completeAction?: DashboardFormAction;
  progressAction?: DashboardFormAction;
  createTaskAction?: DashboardFormAction;
  taskJobs?: DashboardJobOption[];
};

export function Dashboard({
  waitingDays = 5,
  view,
  displayName,
  now,
  completeAction,
  progressAction,
  createTaskAction,
  taskJobs = [],
}: DashboardProps) {
  const [creatingTask, setCreatingTask] = useState(false);
  const closeTask = useCallback(() => setCreatingTask(false), []);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const onCompleted = useCallback(
    (item: DashboardActionItem, message: string) => {
      setCompleted((previous) =>
        new Set(previous).add(`${item.sourceType}-${item.id}`),
      );
      setFeedback(message);
    },
    [],
  );
  const [showAll, setShowAll] = useState<
    "today" | "schedule" | "attention" | null
  >(null);
  const [followUpJob, setFollowUpJob] = useState<JobTrackListItem | null>(null);
  const closeFollowUp = useCallback(() => setFollowUpJob(null), []);
  function followUp(job: JobTrackListItem) {
    setShowAll(null);
    setFeedback("");
    setFollowUpJob(job);
  }
  const closeAll = useCallback(() => setShowAll(null), []);
  const today = view.todayItems.filter(
    (item) =>
      !completed.has(`${item.sourceType}-${item.id}`),
  );
  const upcoming = view.upcomingItems.filter(
    (item) => !completed.has(`${item.sourceType}-${item.id}`),
  );
  const coveredJobs = new Set(
    view.todayItems
      .filter((item) => item.overdue)
      .map((item) => item.jobTrackId),
  );
  const attentionJobs = view.attentionJobs
    .map((job) => ({
      ...job,
      attentionFlags: job.attentionFlags.filter(
        (flag) => flag !== "overdue" || !coveredJobs.has(job.id),
      ),
    }))
    .filter((job) => job.attentionFlags.length > 0);
  const date = dateParts(now);
  const renderAttentionJob = (job: JobTrackListItem) => (
    <AttentionJob
      key={`job-${job.id}`}
      job={job}
      onFollowUp={progressAction ? followUp : undefined}
    />
  );
  const attentionCards = [
    ...attentionJobs
      .filter((job) => job.attentionFlags.includes("overdue"))
      .map(renderAttentionJob),
    ...attentionJobs
      .filter((job) => !job.attentionFlags.includes("overdue"))
      .map(renderAttentionJob),
  ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>
            <span className="dashboard-greeting">{greeting(now)}，</span>
            <span className="dashboard-greeting-name" title={displayName}>
              {displayName}
            </span>
            <Sprout aria-hidden="true" size={23} />
          </h1>
          <p>专注积累，静待花开</p>
        </div>
        <CompanyJobSearch />
        <div className="dashboard-profile">
          <span className="dashboard-today">
            {date.date} · {date.weekday}
          </span>
          <span className="dashboard-avatar" aria-hidden="true">
            {Array.from(displayName)[0]?.toUpperCase()}
          </span>
          <span className="dashboard-profile-name">{displayName}</span>
        </div>
      </header>
      {feedback && (
        <p className="dashboard-feedback" role="status">
          <CircleCheck size={17} aria-hidden="true" />
          {feedback}
        </p>
      )}
      <section className="dashboard-metrics" aria-label="求职进度概览">
        <MetricCard
          href="/jobs?tab=planned"
          label="待投递"
          value={view.counts.planned}
          tone="mint"
          icon={<Send />}
        />
        <MetricCard
          href="/jobs?tab=active"
          label="进行中"
          value={view.counts.active}
          tone="amber"
          icon={<BriefcaseBusiness />}
        />
        <MetricCard
          href="/jobs?tab=ended"
          label="已结束"
          value={view.counts.ended}
          tone="slate"
          icon={<CircleCheck />}
        />
      </section>
      <div className="dashboard-columns">
        <section
          className="dashboard-panel"
          aria-labelledby="dashboard-tasks-heading"
        >
          <PanelHeading
            id="dashboard-tasks-heading"
            icon={<ClipboardCheck />}
            title="今天要做"
            count={today.length}
          >
            {today.length > 3 && (
              <button
                className="dashboard-text-button"
                type="button"
                aria-label="查看全部今日事项"
                onClick={() => setShowAll("today")}
              >
                查看全部
                <ChevronRight size={16} />
              </button>
            )}
          </PanelHeading>
          {today.length ? (
            <div className="dashboard-items dashboard-scroll-items">
              {today.map((item) => (
                <TaskRow
                  key={`${item.sourceType}-${item.id}`}
                  item={item}
                  now={now}
                  completeAction={completeAction}
                  onCompleted={onCompleted}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ClipboardCheck />}
              title="今天暂时没有待完成事项"
              description="给下一次机会，留一点准备的时间。"
            >
              {createTaskAction ? (
                <button
                  className="dashboard-text-button"
                  type="button"
                  onClick={() => {
                    setFeedback("");
                    setCreatingTask(true);
                  }}
                >
                  添加待办
                  <ChevronRight size={15} />
                </button>
              ) : (
                <Link className="dashboard-text-button" href="/quick">
                  添加待办
                  <ChevronRight size={15} />
                </Link>
              )}
            </EmptyState>
          )}
        </section>
        <section
          className="dashboard-panel"
          aria-labelledby="dashboard-schedule-heading"
        >
          <PanelHeading
            id="dashboard-schedule-heading"
            icon={<CalendarDays />}
            title="未来 7 天"
            count={upcoming.length}
          >
            <Link className="dashboard-text-button" href="/calendar">
              查看日历
              <ChevronRight size={16} />
            </Link>
          </PanelHeading>
          {upcoming.length ? (
            <>
              <div className="dashboard-items dashboard-schedule dashboard-scroll-items">
                {upcoming.map((item) => (
                  <ScheduleRow
                    key={`${item.sourceType}-${item.id}`}
                    item={item}
                    now={now}
                  />
                ))}
              </div>
              {upcoming.length > 3 && (
                <button
                  className="dashboard-text-button dashboard-list-more"
                  aria-label="查看全部日程"
                  type="button"
                  onClick={() => setShowAll("schedule")}
                >
                  查看全部 {upcoming.length} 项日程
                  <ChevronRight size={15} />
                </button>
              )}
            </>
          ) : (
            <EmptyState
              icon={<CalendarDays />}
              title="未来 7 天暂无日程"
              description="面试、测评和有截止时间的待办会显示在这里。"
            >
              <Link className="dashboard-text-button" href="/jobs?tab=active">
                查看进行中的岗位
                <ChevronRight size={15} />
              </Link>
            </EmptyState>
          )}
        </section>
      </div>
      <section
        className="dashboard-panel dashboard-attention"
        aria-labelledby="dashboard-attention-heading"
      >
        <PanelHeading
          id="dashboard-attention-heading"
          icon={<Bookmark />}
          title="需要关注"
          count={attentionCards.length}
        >
          <AttentionSettingsForm days={waitingDays} />
          {attentionCards.length > 3 && (
            <button
              className="dashboard-text-button"
              type="button"
              aria-label="查看全部关注事项"
              onClick={() => setShowAll("attention")}
            >
              查看全部
              <ChevronRight size={16} />
            </button>
          )}
        </PanelHeading>
        {attentionCards.length ? (
          <div className="dashboard-attention-list">
            {attentionCards.slice(0, 3)}
          </div>
        ) : (
          <EmptyState
            icon={<Check />}
            title="目前没有需要额外关注的事项"
            description={
              coveredJobs.size
                ? "逾期事项已列在“今天要做”，可以直接处理。"
                : "有等待较久或待复盘的事项时，会在这里提醒你。"
            }
          />
        )}
      </section>
      {showAll && (
        <OperationModal
          title={
            showAll === "today"
              ? `今天要做 · ${today.length} 项`
              : showAll === "schedule"
                ? `未来 7 天 · ${upcoming.length} 项`
                : `需要关注 · ${attentionCards.length} 项`
          }
          onClose={closeAll}
        >
          {feedback && (
            <p className="dashboard-feedback" role="status">
              {feedback}
            </p>
          )}
          <div className="dashboard-items dashboard-all-items">
            {showAll === "today" ? (
              today.length ? (
                today.map((item) => (
                  <TaskRow
                    key={`${item.sourceType}-${item.id}`}
                    item={item}
                    now={now}
                    completeAction={completeAction}
                    onCompleted={onCompleted}
                  />
                ))
              ) : (
                <p>今天的事项已全部处理。</p>
              )
            ) : showAll === "schedule" ? (
              upcoming.map((item) => (
                <ScheduleRow
                  key={`${item.sourceType}-${item.id}`}
                  item={item}
                  now={now}
                />
              ))
            ) : (
              attentionCards
            )}
          </div>
        </OperationModal>
      )}
      {followUpJob && progressAction && (
        <DashboardProgressModal
          job={followUpJob}
          action={progressAction}
          onClose={closeFollowUp}
          onSuccess={(message) => {
            setFeedback(message);
            closeFollowUp();
          }}
        />
      )}
      {creatingTask && createTaskAction && (
        <DashboardTaskModal
          jobs={taskJobs}
          now={now}
          action={createTaskAction}
          onClose={closeTask}
          onSuccess={(message) => {
            setFeedback(message);
            closeTask();
          }}
        />
      )}
    </main>
  );
}

function MetricCard({
  href,
  label,
  value,
  tone,
  icon,
}: {
  href: string;
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      aria-label={`${label}，共 ${value} 个岗位`}
      className={`dashboard-metric ${tone}`}
      href={href}
    >
      <span className="dashboard-metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="dashboard-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <ArrowUpRight
        className="dashboard-metric-arrow"
        size={17}
        aria-hidden="true"
      />
    </Link>
  );
}

function PanelHeading({
  id,
  icon,
  title,
  count,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="dashboard-panel-heading">
      <h2 id={id}>
        <span aria-hidden="true">{icon}</span>
        {title}
        {count > 0 && <small aria-label={`${count} 项`}>{count}</small>}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="dashboard-empty">
      <span className="dashboard-empty-icon" aria-hidden="true">
        {icon}
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {children}
    </div>
  );
}

function TaskRow({
  item,
  now,
  completeAction,
  onCompleted,
}: {
  item: DashboardActionItem;
  now: string;
  completeAction?: DashboardFormAction;
  onCompleted: (item: DashboardActionItem, message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function complete() {
    if (!completeAction) return;
    setError(null);
    const form = new FormData();
    form.set("sourceType", item.sourceType);
    form.set("itemId", item.id);
    form.set(
      "idempotencyKey",
      `dashboard:${item.sourceType}:${item.id}:complete`,
    );
    startTransition(async () => {
      try {
        const result = await completeAction(
          { error: null, success: null },
          form,
        );
        if (result.error) setError(result.error);
        else if (result.success) onCompleted(item, result.success);
        else setError("尚未确认完成，请重试。");
      } catch {
        setError("暂时无法完成，请检查网络后重试。");
      }
    });
  }
  return (
    <article className={`dashboard-task-row ${item.overdue ? "overdue" : ""}`}>
      {completeAction && (item.sourceType === "task" || item.sourceType === "assessment" || item.sourceType === "interview_review") ? (
        <button
          className="dashboard-complete"
          type="button"
          aria-label={`完成：${item.title}`}
          title="标记完成"
          disabled={pending}
          onClick={complete}
        >
          <span>{pending ? "…" : <Check size={14} />}</span>
        </button>
      ) : (
        <span className="dashboard-task-marker" aria-hidden="true" />
      )}
      <Link
        className="dashboard-item-copy"
        href={
          (item.sourceType === "interview" || item.sourceType === "interview_review") ? `/interviews/${item.id}` : item.interviewId
            ? `/interviews/${item.interviewId}#task-${item.id}`
            : item.jobTrackId
              ? `/jobs/${item.jobTrackId}#${item.sourceType}-${item.id}`
              : `/quick#task-${item.id}`
        }
      >
        <strong>{item.title}</strong>
        <p>
          {item.sourceType === "assessment"
            ? "测评 / 笔试"
            : item.sourceType === "interview" ? "面试" : item.sourceType === "interview_review" ? "面试复盘" : item.taskKind === "interview_prep"
              ? "面试准备"
              : "待办"}{" "}
          · {item.companyName ?? "通用事项"}{item.department ? ` · ${item.department}` : ""}
          {item.roleName ? ` · ${item.roleName}` : ""}
        </p>
      </Link>
      <div className="dashboard-item-trailing">{item.externalUrl && <a className="external-event-link" href={item.externalUrl} target="_blank" rel="noreferrer">{item.sourceType === "interview" ? "进入会议 ↗" : "测评链接 ↗"}</a>}
      <time
        className={`dashboard-time-pill ${item.overdue ? "overdue" : "mint"}`}
        dateTime={item.dueAt ?? undefined}
        title={item.dueAt ? fullDateTime(item.dueAt) : "无截止时间"}
      >
        {item.overdue
          ? item.timeSource === "start"
            ? "计划时间已过 · "
            : "已逾期 · "
          : item.timeSource === "interview"
            ? "面试 "
            : item.timeSource === "deadline" && item.dueAt
              ? "截止 "
              : ""}
        {!item.overdue && item.timeSource === "start" && item.endAt && item.dueAt && item.dueAt <= now && item.endAt > now ? "进行中 · " : ""}{item.dueAt ? relativeTime(item.dueAt, now) : "无时间"}
      </time></div>
      {error && (
        <p className="dashboard-row-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function ScheduleRow({ item, now }: { item: CalendarItem; now: string }) {
  const parts = dateParts(item.startAt);
  return (
    <Link
      className={`dashboard-schedule-row ${item.sourceType}`}
      href={
        item.sourceType === "interview"
          ? `/interviews/${item.id}`
          : item.jobTrackId
            ? `/jobs/${item.jobTrackId}#${item.sourceType}-${item.id}`
            : "/calendar"
      }
    >
      <time className="dashboard-schedule-date" dateTime={item.startAt}>
        <strong>{parts.date}</strong>
        <span>{parts.weekday}</span>
      </time>
      <span className="dashboard-timeline-dot" aria-hidden="true" />
      <div className="dashboard-item-copy">
        <strong>{item.title}</strong>
        <p>
          {item.sourceType === "interview"
            ? "面试"
            : item.sourceType === "assessment"
              ? "测评 / 笔试"
              : "待办"}{" "}
          · {item.companyName ?? "通用事项"}{item.department ? ` · ${item.department}` : ""}
          {item.hasConflict && (
            <span className="dashboard-conflict"> · 时间冲突</span>
          )}
        </p>
      </div>
      <time
        className="dashboard-time-pill"
        dateTime={item.startAt}
        title={fullDateTime(item.startAt)}
      >
        {item.isDeadline ? "截止 " : ""}
        {relativeTime(item.startAt, now)}
      </time>
    </Link>
  );
}

function AttentionJob({
  job,
  onFollowUp,
}: {
  job: JobTrackListItem;
  onFollowUp?: (job: JobTrackListItem) => void;
}) {
  const overdue = job.attentionFlags.includes("overdue");
  return (
    <article
      className={`dashboard-attention-card ${overdue ? "overdue" : "waiting"}`}
    >
      <span className="dashboard-attention-icon" aria-hidden="true">
        <BriefcaseBusiness size={23} />
      </span>
      <div className="dashboard-item-copy">
        <Link href={`/jobs/${job.id}`}>
          <strong>
            {job.companyName}{job.department ? ` · ${job.department}` : ""} · {job.roleName}
          </strong>
        </Link>
        <p>{job.latestEvent ? <>{eventLabel(job.latestEvent.kind)}{eventDetail(job.latestEvent.kind, job.latestEvent.payload) ? ' · ' + eventDetail(job.latestEvent.kind, job.latestEvent.payload) : ''}</> : '暂无动态'}</p>
        {job.waitingDays != null && <small className="attention-waiting-days">等待 {job.waitingDays} 天</small>}
      </div>
      {!overdue && onFollowUp ? (
        <button
          className="dashboard-outline-button"
          type="button"
          onClick={() => onFollowUp(job)}
        >
          记录跟进
        </button>
      ) : (
        <Link className="dashboard-outline-button" href={`/jobs/${job.id}`}>
          {overdue ? "去处理" : "查看岗位"}
        </Link>
      )}
    </article>
  );
}
