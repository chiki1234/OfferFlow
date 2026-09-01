import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft, Video } from "lucide-react";
import { FaqBatchForm } from "@/app/faq/knowledge-forms";
import { InterviewScheduleEditor, InterviewTranscriptForm } from "@/app/jobs/[id]/job-actions-panel";
import { getInterviewKnowledgeDetail } from "@/modules/interview-knowledge/queries";
import { getCurrentActor } from "@/shared/actor/current-actor";

export const dynamic = "force-dynamic";

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getInterviewKnowledgeDetail(getCurrentActor().userId, id);
  return <main className="page-stack"><Link className="back-link" href={`/jobs/${view.interview.jobTrackId}`}><ArrowLeft size={16} />返回岗位</Link><header className="page-heading"><div><p className="eyebrow">面试准备与复盘</p><h1>{view.interview.roundLabel} · {view.interview.interviewType}</h1><p className="page-description">{view.interview.companyName} · {view.interview.roleName} · {formatDateTime(view.interview.startAt)}</p></div>{view.interview.meetingUrl && <a className="primary-button" href={view.interview.meetingUrl} rel="noreferrer" target="_blank"><Video size={17} />进入会议</a>}</header>
    <div className="detail-layout"><div className="detail-main"><section className="surface-card detail-section"><div className="section-title-row"><div><p className="eyebrow">针对性准备</p><h2>本简历经历</h2></div></div><div className="experience-grid">{view.experiences.map((item) => <Link className="surface-card experience-card" href={`/experiences/${item.id}`} key={item.id}><strong>{item.name}</strong><p>{item.content}</p></Link>)}{!view.experiences.length && <p className="detail-note">还没有与投递简历关联的经历。</p>}</div></section>
      <section className="surface-card detail-section"><div className="section-title-row"><div><p className="eyebrow">本场沉淀</p><h2>FAQ</h2></div></div><div className="faq-card-list">{view.faqs.map((faq) => <article className="faq-card" key={faq.id}><div className="faq-card-meta"><span>{faq.category}</span><span>{faq.experienceName ?? "综合问题"}</span></div><h3>{faq.question}</h3><p>{faq.answer}</p></article>)}{!view.faqs.length && <p className="detail-note">面试后把整理好的 FAQ Blocks 粘贴到右侧。</p>}</div></section></div>
      <aside className="surface-card knowledge-tools">{view.interview.status === "scheduled" && <InterviewScheduleEditor jobTrackId={view.interview.jobTrackId} interviewId={view.interview.id} token={randomUUID()} startAt={toLocalInput(view.interview.startAt)} endAt={toLocalInput(view.interview.endAt)} />}{view.interview.transcriptAssetId && <a className="transcript-file-link" href={`/api/assets/${view.interview.transcriptAssetId}`} target="_blank" rel="noreferrer">打开转录文件：{view.interview.transcriptAssetName ?? "Transcript"}</a>}<InterviewTranscriptForm jobTrackId={view.interview.jobTrackId} interviewId={view.interview.id} token={randomUUID()} transcriptText={view.interview.transcriptText} /><FaqBatchForm token={randomUUID()} interviews={[{ id: view.interview.id, companyName: view.interview.companyName, roleName: view.interview.roleName, roundLabel: view.interview.roundLabel }]} experiences={view.experiences} /></aside></div>
  </main>;
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function toLocalInput(value: string) { const date = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000); return date.toISOString().slice(0, 16); }
