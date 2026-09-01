import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getExperienceDetail } from "@/modules/interview-knowledge/queries";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { ExperienceEditor } from "@/app/faq/knowledge-forms";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";

export const dynamic = "force-dynamic";

export default async function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getExperienceDetail(getCurrentActor().userId, id).catch((error: unknown) => {
    if (isDomainNotFoundError(error)) notFound();
    throw error;
  });
  return <main className="page-stack"><Link className="back-link" href="/faq"><ArrowLeft size={16} />返回 FAQ</Link><header className="page-heading"><div><p className="eyebrow">Experience</p><h1>{view.experience.name}</h1><p className="page-description">{view.faqs.length} 条历史 FAQ · {view.resumes.length} 个简历版本正在使用</p></div></header>
    <section className="surface-card detail-section experience-content"><p>{view.experience.content}</p>{view.resumes.length > 0 && <div className="resume-tags">{view.resumes.map((resume) => <span key={resume.id}>{resume.name}</span>)}</div>}<ExperienceEditor experience={view.experience} /></section>
    <section className="experience-faq-section"><div className="section-title-row"><div><p className="eyebrow">问题积累</p><h2>围绕该经历被问过什么？</h2></div></div><div className="faq-card-list">{view.faqs.map((faq) => <article className="surface-card faq-card" key={faq.id}><div className="faq-card-meta"><span>{faq.category}</span></div><h3>{faq.question}</h3><p>{faq.answer}</p><footer>来源：{faq.companyName} · {faq.roleName} · {faq.roundLabel}</footer></article>)}</div></section>
  </main>;
}
