import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Video } from "lucide-react";
import { FaqBatchForm, FaqEditor } from "@/app/faq/knowledge-forms";
import {
  InterviewPrepTaskForm,
  InterviewScheduleEditor,
  InterviewTranscriptForm,
  StatusActionButton,
} from "@/app/jobs/[id]/job-actions-panel";
import { getInterviewKnowledgeDetail } from "@/modules/interview-knowledge/queries";
import { isFaqSettingsComplete } from "@/modules/interview-knowledge/faq-batch";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";

export const dynamic = "force-dynamic";

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  const view = await getInterviewKnowledgeDetail(actor.userId, id).catch((error: unknown) => {
    if (isDomainNotFoundError(error)) notFound();
    throw error;
  });
  const interview = view.interview;
  const reviewDue = interview.status === "scheduled" && new Date(interview.startAt) <= new Date() && !interview.reviewedAt;

  return <main className="page-stack">
    <Link className="back-link" href={`/jobs/${interview.jobTrackId}`}><ArrowLeft size={16} />返回岗位</Link>
    <header className="page-heading">
      <div><p className="eyebrow">面试准备与复盘</p><h1>{interview.roundLabel} · {interview.interviewType}</h1><p className="page-description">{interview.companyName} · {interview.roleName} · {formatDateTime(interview.startAt)}</p></div>
      {interview.meetingUrl && <a className="primary-button" href={interview.meetingUrl} rel="noreferrer" target="_blank"><Video size={17} />进入会议</a>}
    </header>

    <div className="detail-layout">
      <div className="detail-main">
        <section className="surface-card detail-section">
          <div className="section-title-row"><div><p className="eyebrow">投递上下文</p><h2>岗位与简历</h2></div><FileText size={20} /></div>
          <div className="interview-context-grid">
            <article><span>投递简历</span>{interview.resumeAssetId ? <a href={`/api/assets/${interview.resumeAssetId}`} target="_blank" rel="noreferrer">{interview.resumeName ?? "打开简历"}</a> : <strong>未绑定简历</strong>}</article>
            <article><span>面试时段</span><strong>{formatDateTime(interview.startAt)} – {formatTime(interview.endAt)}</strong></article>
            <article><span>复盘状态</span><strong>{interview.reviewedAt ? `已于 ${formatDateTime(interview.reviewedAt)} 完成` : reviewDue ? "待复盘" : "尚未到复盘时间"}</strong></article>
          </div>
          {interview.notes && <div className="interview-notes"><strong>面试备注</strong><p>{interview.notes}</p></div>}
          <details className="jd-context"><summary>查看本岗位 JD</summary><p>{interview.jobDescription || "JD 以图片保存，可返回岗位详情查看。"}</p></details>
        </section>

        <section className="surface-card detail-section">
          <div className="section-title-row"><div><p className="eyebrow">本场准备</p><h2>面试待办</h2></div></div>
          <div className="milestone-list">
            {view.tasks.map((task) => <article className="milestone-item" key={task.id}><div><strong>{task.title}</strong><p>{task.deadlineAt ? `截止 ${formatDateTime(task.deadlineAt)}` : "无截止时间"}</p></div><span className={`status-pill ${task.completedAt ? "completed" : task.cancelledAt ? "cancelled" : "pending"}`}>{task.completedAt ? "已完成" : task.cancelledAt ? "已取消" : "待完成"}</span>{!task.completedAt && !task.cancelledAt && <div className="milestone-actions"><StatusActionButton intent="complete_task" jobTrackId={interview.jobTrackId} subjectId={task.id} token={randomUUID()} label="完成" /><StatusActionButton intent="cancel_task" jobTrackId={interview.jobTrackId} subjectId={task.id} token={randomUUID()} label="取消" /></div>}</article>)}
            {!view.tasks.length && <p className="detail-note">还没有为本场面试创建准备待办。</p>}
          </div>
        </section>

        <section className="surface-card detail-section">
          <div className="section-title-row"><div><p className="eyebrow">针对性准备</p><h2>本简历经历</h2></div></div>
          <div className="experience-grid">{view.experiences.map((item) => <Link className="surface-card experience-card" href={`/experiences/${item.id}`} key={item.id}><strong>{item.name}</strong><p>{item.content}</p></Link>)}{!view.experiences.length && <p className="detail-note">还没有与投递简历关联的经历。</p>}</div>
        </section>

        <section className="surface-card detail-section">
          <div className="section-title-row"><div><p className="eyebrow">本场沉淀</p><h2>FAQ</h2></div></div>
          <div className="faq-card-list">{view.faqs.map((faq) => {
            const settingsComplete = isFaqSettingsComplete(faq);
            const settingLabel = faq.experienceId ? faq.experienceName ?? "已绑定经历" : faq.category ?? "暂不设置";
            return <article className="faq-card" key={faq.id}><div className={settingsComplete ? "faq-card-meta" : "faq-card-meta incomplete"}><span>{settingLabel}</span></div><h3>{faq.question}</h3><p>{faq.answer || "暂未记录答案"}</p><FaqEditor faq={faq} experiences={view.experiences} faqCategories={view.faqCategories} incomplete={!settingsComplete} /></article>;
          })}{!view.faqs.length && <p className="detail-note">面试后把整理好的 FAQ Blocks 粘贴到右侧。</p>}</div>
        </section>
      </div>

      <aside className="surface-card knowledge-tools">
        {reviewDue && <div className="interview-review-callout"><div><strong>复盘完成了吗？</strong><p>保存 Transcript 或 FAQ 会自动确认面试已发生；整理结束后在这里关闭提醒。</p></div><StatusActionButton intent="complete_interview_review" jobTrackId={interview.jobTrackId} subjectId={interview.id} token={randomUUID()} label="完成复盘" /></div>}
        {interview.status === "scheduled" && !interview.occurredAt && <InterviewPrepTaskForm jobTrackId={interview.jobTrackId} interviewId={interview.id} token={randomUUID()} />}
        {interview.status === "scheduled" && <InterviewScheduleEditor jobTrackId={interview.jobTrackId} interviewId={interview.id} token={randomUUID()} startAt={toLocalInput(interview.startAt)} endAt={toLocalInput(interview.endAt)} />}
        {interview.transcriptAssetId && <a className="transcript-file-link" href={`/api/assets/${interview.transcriptAssetId}`} target="_blank" rel="noreferrer">打开转录文件：{interview.transcriptAssetName ?? "Transcript"}</a>}
        <InterviewTranscriptForm jobTrackId={interview.jobTrackId} interviewId={interview.id} token={randomUUID()} transcriptText={interview.transcriptText} />
        <FaqBatchForm token={randomUUID()} interviews={[{ id: interview.id, companyName: interview.companyName, roleName: interview.roleName, roundLabel: interview.roundLabel }]} experiences={view.experiences} faqCategories={view.faqCategories} />
      </aside>
    </div>
  </main>;
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function toLocalInput(value: string) { const date = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000); return date.toISOString().slice(0, 16); }
