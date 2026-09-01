import { randomUUID } from "node:crypto";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CircleAlert, ExternalLink, FileText, Hourglass } from "lucide-react";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";
import { JobActionsPanel, JobContextEditor, StatusActionButton, TaskEditor } from "./job-actions-panel";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getWorkspaceQueries().read({ type: "get_job_track_detail", jobTrackId: id }, getCurrentActor()).catch((error: unknown) => {
    if (isDomainNotFoundError(error)) notFound();
    throw error;
  });
  return <main className="page-stack">
    <Link className="back-link" href="/jobs"><ArrowLeft size={16} />返回岗位列表</Link>
    <header className="page-heading detail-heading"><div><p className="eyebrow">{lifecycleLabel(view.jobTrack.lifecycle)}</p><h1>{view.jobTrack.roleName}</h1><p className="page-description">{view.jobTrack.companyName} · {actionLabel(view.jobTrack.actionState)}</p></div>{view.jobTrack.jobUrl && <a className="secondary-button" href={view.jobTrack.jobUrl} rel="noreferrer" target="_blank">查看原岗位 <ExternalLink size={16} /></a>}</header>

    <div className="detail-layout">
      <div className="detail-main">
        <section className={`surface-card current-next-panel ${view.currentNext.state}`}>
          <div className="current-next-icon">{view.currentNext.state === "waiting" ? <Hourglass size={21} /> : <CircleAlert size={21} />}</div>
          <div>
            <p className="eyebrow">当前 / 下一步</p>
            <h2>{view.currentNext.title}</h2>
            <p>{view.currentNext.detail}{view.currentNext.scheduledAt && view.currentNext.state === "action_required" ? ` · ${formatDateTime(view.currentNext.scheduledAt)}` : ""}</p>
            {view.jobTrack.attentionFlags.length > 0 && <div className="attention-flags">{view.jobTrack.attentionFlags.map((flag) => <span key={flag}>{flag === "overdue" ? "逾期" : "等待较久"}</span>)}</div>}
          </div>
        </section>
        <section className="surface-card detail-section"><div className="section-title-row"><div><p className="eyebrow">岗位上下文</p><h2>JD 与投递简历</h2></div><FileText size={20} /></div>{view.selectedResume && <a className="transcript-file-link" href={`/api/assets/${view.selectedResume.assetId}`} target="_blank" rel="noreferrer">打开投递简历：{view.selectedResume.name}</a>}{view.selectedResumeExperiences.length > 0 && <div className="resume-experience-links"><strong>这份简历包含的经历</strong><div>{view.selectedResumeExperiences.map((experience) => <Link href={`/experiences/${experience.id}`} key={experience.id}><span>{experience.name}</span><small>{experience.faqCount} FAQ</small></Link>)}</div></div>}<p className="jd-copy">{view.jobTrack.jobDescription || (view.jobDescriptionImages.length ? "JD 以截图保存。" : "还没有补充 JD。")}</p>{view.jobDescriptionImages.length > 0 && <div className="jd-image-grid">{view.jobDescriptionImages.map((asset) => <a href={`/api/assets/${asset.id}`} key={asset.id} target="_blank" rel="noreferrer"><Image src={`/api/assets/${asset.id}`} alt={asset.originalName} width={360} height={240} unoptimized /><span>{asset.originalName}</span></a>)}</div>}<JobContextEditor jobTrack={view.jobTrack} token={randomUUID()} /></section>
        <section className="surface-card detail-section"><div className="section-title-row"><div><p className="eyebrow">硬时间</p><h2>测评与面试</h2></div><CalendarClock size={20} /></div>
          <div className="milestone-list">
            {view.assessments.map((item) => <article className="milestone-item" key={item.id}><div><strong>{item.title}</strong><p>{item.timing.type === "deadline" ? `截止 ${formatDateTime(item.timing.deadlineAt)}` : `${formatDateTime(item.timing.startAt)} – ${formatDateTime(item.timing.endAt)}`}</p></div><span className={`status-pill ${item.status}`}>{statusLabel(item.status)}</span>{item.status === "pending" && <div className="milestone-actions"><StatusActionButton intent="complete_assessment" jobTrackId={id} subjectId={item.id} token={randomUUID()} label="标记完成" /><StatusActionButton intent="cancel_assessment" jobTrackId={id} subjectId={item.id} token={randomUUID()} label="取消" /></div>}</article>)}
            {view.interviews.map((item) => <article className="milestone-item" key={item.id}><Link href={`/interviews/${item.id}`}><strong>{item.roundLabel} · {item.interviewType}</strong><p>{formatDateTime(item.startAt)} – {formatTime(item.endAt)}</p></Link><span className={`status-pill ${item.status}`}>{item.reviewedAt ? "已复盘" : item.occurredAt ? "已发生" : statusLabel(item.status)}</span>{item.status === "scheduled" && !item.reviewedAt && <div className="milestone-actions"><StatusActionButton intent="cancel_interview" jobTrackId={id} subjectId={item.id} token={randomUUID()} label="取消" />{new Date(item.startAt) <= new Date() && !item.occurredAt && <StatusActionButton intent="confirm_interview_occurred" jobTrackId={id} subjectId={item.id} token={randomUUID()} label="确认已发生" />}{new Date(item.startAt) <= new Date() && <StatusActionButton intent="complete_interview_review" jobTrackId={id} subjectId={item.id} token={randomUUID()} label="完成复盘" />}</div>}</article>)}
            {!view.assessments.length && !view.interviews.length && <p className="detail-note">还没有测评或面试记录。</p>}
          </div>
        </section>
        <section className="surface-card detail-section"><div className="section-title-row"><div><p className="eyebrow">行动队列</p><h2>待办</h2></div></div><div className="milestone-list">{view.tasks.filter((task) => task.kind !== "assessment").map((task) => <article className="milestone-item" key={task.id}><div><strong>{task.title}</strong><p>{task.deadlineAt ? `截止 ${formatDateTime(task.deadlineAt)}` : "无截止时间"}</p>{task.interviewId && <small>已关联面试</small>}{!task.completedAt && !task.cancelledAt && <TaskEditor jobTrackId={id} task={task} interviews={view.interviews.map(({ id: interviewId, roundLabel, interviewType }) => ({ id: interviewId, roundLabel, interviewType }))} token={randomUUID()} />}</div><span className={`status-pill ${task.completedAt ? "completed" : task.cancelledAt ? "cancelled" : "pending"}`}>{task.completedAt ? "已完成" : task.cancelledAt ? "已取消" : "待完成"}</span>{!task.completedAt && !task.cancelledAt && <div className="milestone-actions"><StatusActionButton intent="complete_task" jobTrackId={id} subjectId={task.id} token={randomUUID()} label="完成" /><StatusActionButton intent="cancel_task" jobTrackId={id} subjectId={task.id} token={randomUUID()} label="取消" /></div>}</article>)}{!view.tasks.some((task) => task.kind !== "assessment") && <p className="detail-note">还没有普通待办。</p>}</div></section>
        <section className="surface-card detail-section"><div className="section-title-row"><div><p className="eyebrow">时间线</p><h2>招聘事实</h2></div></div><div className="timeline-list">{view.jobTrack.lifecycle === "active" && <div className="timeline-item current"><span /><div><section><strong>当前：{view.currentNext.title}</strong><p>{view.currentNext.detail}</p></section><time>现在</time></div></div>}{view.events.map((event) => { const detail = eventDetail(event.kind, event.payload); return <div className="timeline-item" key={event.id}><span /><div><section><strong>{eventLabel(event.kind)}</strong>{detail && <p>{detail}</p>}</section><time>{formatDateTime(event.occurredAt)}</time></div></div>; })}{!view.events.length && view.jobTrack.lifecycle !== "active" && <p className="detail-note">投递后的每次进展会出现在这里。</p>}</div></section>
      </div>
      <aside className="surface-card form-panel detail-actions"><JobActionsPanel jobTrackId={id} lifecycle={view.jobTrack.lifecycle} resumes={view.resumes} tokens={{ submit: randomUUID(), assessment: randomUUID(), interview: randomUUID(), resume: randomUUID(), jdImages: randomUUID(), task: randomUUID(), rejection: randomUUID(), end: randomUUID(), progress: randomUUID(), delete: randomUUID() }} /></aside>
    </div>
  </main>;
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function lifecycleLabel(value: "planned" | "active" | "ended") { return { planned: "待投递", active: "进行中", ended: "已结束" }[value]; }
function actionLabel(value: "action_required" | "waiting" | null) { return value === "action_required" ? "有下一步行动" : value === "waiting" ? "等待进展" : "尚未投递"; }
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
