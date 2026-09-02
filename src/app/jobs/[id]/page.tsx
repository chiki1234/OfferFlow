import { randomUUID } from "node:crypto";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import { getExperienceOptions } from "@/modules/interview-knowledge/queries";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";
import {
  AddJobDescriptionImagesButton,
  DeleteRecordButton,
  JobContextEditor,
  RecordApplicationButton,
  RecordJobProgressButton,
  StatusActionButton,
  TaskEditor,
} from "./job-actions-panel";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  const [view, experiences] = await Promise.all([
    getWorkspaceQueries().read({ type: "get_job_track_detail", jobTrackId: id }, actor).catch((error: unknown) => {
      if (isDomainNotFoundError(error)) notFound();
      throw error;
    }),
    getExperienceOptions(actor.userId),
  ]);
  const ordinaryTasks = view.tasks.filter((task) => task.kind !== "assessment");

  return <main className="page-stack">
    <Link className="back-link" href="/jobs"><ArrowLeft size={16} />返回岗位列表</Link>
    <header className="page-heading detail-heading">
      <div>
        <p className="eyebrow">{lifecycleLabel(view.jobTrack.lifecycle)}</p>
        <h1>{view.jobTrack.companyName} | {view.jobTrack.roleName}</h1>
      </div>
      {view.jobTrack.jobUrl && <a className="secondary-button" href={view.jobTrack.jobUrl} rel="noreferrer" target="_blank">查看原岗位 <ExternalLink size={16} /></a>}
    </header>

    <div className="detail-main job-detail-content">
      <section className="surface-card detail-section timeline-card">
        <div className="section-title-row">
          <h2>时间线</h2>
          <div className="section-actions">
            {view.jobTrack.lifecycle === "planned"
              ? <RecordApplicationButton experiences={experiences} jobTrackId={id} resumes={view.resumes} token={randomUUID()} />
              : view.jobTrack.lifecycle === "active"
                ? <RecordJobProgressButton jobTrackId={id} token={randomUUID()} />
                : null}
          </div>
        </div>
        <div className="timeline-list">
          {view.jobTrack.lifecycle !== "ended" && <div className="timeline-item current"><span /><div><section><strong>当前：{view.jobTrack.currentNext.title}</strong><p>{view.jobTrack.currentNext.detail}{view.jobTrack.currentNext.scheduledAt && view.jobTrack.currentNext.state === "action_required" ? ` · ${formatDateTime(view.jobTrack.currentNext.scheduledAt)}` : ""}</p>{view.jobTrack.attentionFlags.length > 0 && <div className="attention-flags">{view.jobTrack.attentionFlags.map((flag) => <span key={flag}>{flag === "overdue" ? "逾期" : "等待较久"}</span>)}</div>}</section><time>现在</time></div></div>}
          {view.events.map((event) => {
            const detail = eventDetail(event.kind, event.payload);
            return <div className="timeline-item" key={event.id}><span /><div><section><strong>{eventLabel(event.kind)}</strong>{detail && <p>{detail}</p>}</section><time>{formatDateTime(event.occurredAt)}</time></div></div>;
          })}
          {!view.events.length && view.jobTrack.lifecycle === "ended" && <p className="detail-note">还没有招聘进展记录。</p>}
        </div>
      </section>

      <section className="surface-card detail-section job-description-card">
        <div className="section-title-row">
          <h2>岗位 JD</h2>
          <div className="section-actions">
            <JobContextEditor jobTrack={view.jobTrack} token={randomUUID()} />
            <AddJobDescriptionImagesButton jobTrackId={id} token={randomUUID()} />
          </div>
        </div>
        <details className="jd-disclosure">
          <summary><span>展开 JD 内容</span><ChevronDown aria-hidden="true" size={17} /></summary>
          <div className="jd-disclosure-content">
            <p className="jd-copy">{view.jobTrack.jobDescription || (view.jobDescriptionImages.length ? "JD 以截图保存。" : "还没有补充 JD。")}</p>
            {view.jobDescriptionImages.length > 0 && <div className="jd-image-grid">{view.jobDescriptionImages.map((asset) => <a href={`/api/assets/${asset.id}`} key={asset.id} rel="noreferrer" target="_blank"><Image alt={asset.originalName} height={240} src={`/api/assets/${asset.id}`} unoptimized width={360} /><span>{asset.originalName}</span></a>)}</div>}
          </div>
        </details>
      </section>

      <section className="surface-card detail-section resume-context-card">
        <div className="section-title-row"><h2>投递简历</h2></div>
        <div className="resume-card-content">
          {view.selectedResume
            ? <a className="transcript-file-link" href={`/api/assets/${view.selectedResume.assetId}`} rel="noreferrer" target="_blank">打开投递简历：{view.selectedResume.name}</a>
            : <p className="detail-note">还没有绑定投递简历。</p>}
          {view.selectedResumeExperiences.length > 0 && <div className="resume-experience-links"><strong>这份简历包含的经历</strong><div>{view.selectedResumeExperiences.map((experience) => <Link href={`/experiences/${experience.id}`} key={experience.id}><span>{experience.name}</span><small>{experience.faqCount} FAQ</small></Link>)}</div></div>}
        </div>
      </section>

      <section className="surface-card detail-section">
        <div className="section-title-row"><h2>测评与面试</h2></div>
        <div className="milestone-list">
          {view.assessments.map((item) => <article className="milestone-item" key={item.id}>
            <div><strong>{item.title}</strong><p>{item.timing.type === "deadline" ? `截止 ${formatDateTime(item.timing.deadlineAt)}` : `${formatDateTime(item.timing.startAt)} – ${formatDateTime(item.timing.endAt)}`}</p></div>
            <span className={`status-pill ${item.status}`}>{statusLabel(item.status)}</span>
            <div className="milestone-actions">
              {item.status === "pending" && <><StatusActionButton intent="complete_assessment" jobTrackId={id} label="标记完成" subjectId={item.id} token={randomUUID()} /><StatusActionButton intent="cancel_assessment" jobTrackId={id} label="取消" subjectId={item.id} token={randomUUID()} /></>}
              <DeleteRecordButton jobTrackId={id} kind="assessment" subjectId={item.id} title={item.title} token={randomUUID()} />
            </div>
          </article>)}
          {view.interviews.map((item) => <article className="milestone-item" key={item.id}>
            <Link href={`/interviews/${item.id}`}><strong>{item.roundLabel} · {item.interviewType}</strong><p>{formatDateTime(item.startAt)} – {formatTime(item.endAt)}</p></Link>
            <span className={`status-pill ${item.status}`}>{item.reviewedAt ? "已复盘" : item.occurredAt ? "已发生" : statusLabel(item.status)}</span>
            <div className="milestone-actions">
              {item.status === "scheduled" && !item.reviewedAt && <><StatusActionButton intent="cancel_interview" jobTrackId={id} label="取消" subjectId={item.id} token={randomUUID()} />{new Date(item.startAt) <= new Date() && !item.occurredAt && <StatusActionButton intent="confirm_interview_occurred" jobTrackId={id} label="确认已发生" subjectId={item.id} token={randomUUID()} />}{new Date(item.startAt) <= new Date() && <StatusActionButton intent="complete_interview_review" jobTrackId={id} label="完成复盘" subjectId={item.id} token={randomUUID()} />}</>}
              <DeleteRecordButton jobTrackId={id} kind="interview" subjectId={item.id} title={`${item.roundLabel} · ${item.interviewType}`} token={randomUUID()} />
            </div>
          </article>)}
          {!view.assessments.length && !view.interviews.length && <p className="detail-note">还没有测评或面试记录。</p>}
        </div>
      </section>

      <section className="surface-card detail-section">
        <div className="section-title-row"><h2>待办</h2></div>
        <div className="milestone-list">
          {ordinaryTasks.map((task) => <article className="milestone-item" key={task.id}><div><strong>{task.title}</strong><p>{task.deadlineAt ? `截止 ${formatDateTime(task.deadlineAt)}` : "无截止时间"}</p>{task.interviewId && <small>已关联面试</small>}{!task.completedAt && !task.cancelledAt && <TaskEditor interviews={view.interviews.map(({ id: interviewId, roundLabel, interviewType }) => ({ id: interviewId, roundLabel, interviewType }))} jobTrackId={id} task={task} token={randomUUID()} />}</div><span className={`status-pill ${task.completedAt ? "completed" : task.cancelledAt ? "cancelled" : "pending"}`}>{task.completedAt ? "已完成" : task.cancelledAt ? "已取消" : "待完成"}</span>{!task.completedAt && !task.cancelledAt && <div className="milestone-actions"><StatusActionButton intent="complete_task" jobTrackId={id} label="完成" subjectId={task.id} token={randomUUID()} /><StatusActionButton intent="cancel_task" jobTrackId={id} label="取消" subjectId={task.id} token={randomUUID()} /></div>}</article>)}
          {!ordinaryTasks.length && <p className="detail-note">还没有普通待办。</p>}
        </div>
      </section>
    </div>
  </main>;
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function lifecycleLabel(value: "planned" | "active" | "ended") { return { planned: "待投递", active: "进行中", ended: "已结束" }[value]; }
function statusLabel(value: string) { return { pending: "待完成", completed: "已完成", scheduled: "已安排", cancelled: "已取消" }[value] ?? value; }
function eventLabel(value: string) { return { ApplicationSubmitted: "已投递", AssessmentInvited: "收到测评邀请", AssessmentCompleted: "完成测评", AssessmentCancelled: "测评取消", InterviewInvited: "收到面试邀请", InterviewRescheduled: "面试改期", InterviewCancelled: "面试取消", InterviewOccurred: "面试已发生", InterviewReviewed: "完成面试复盘", RejectionReceived: "收到拒信", JobTrackEnded: "求职推进已结束", GenericProgress: "其他进展" }[value] ?? value; }
function eventDetail(kind: string, payload: Record<string, unknown>) {
  if (kind === "GenericProgress" && typeof payload.summary === "string") return payload.summary;
  if (kind === "RejectionReceived" && typeof payload.notes === "string") return payload.notes;
  if (kind === "InterviewCancelled" && typeof payload.reason === "string") return `原因：${payload.reason}`;
  if (kind === "JobTrackEnded" && typeof payload.reason === "string") return `原因：${{ withdrawn: "主动结束", inactive: "流程失活", other: "其他" }[payload.reason] ?? payload.reason}`;
  if (kind === "InterviewRescheduled" && typeof payload.previousStartAt === "string" && typeof payload.startAt === "string") return `${formatDateTime(payload.previousStartAt)} → ${formatDateTime(payload.startAt)}`;
  return null;
}
