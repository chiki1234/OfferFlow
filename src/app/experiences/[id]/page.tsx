import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getExperienceDetail, getExperienceOptions } from "@/modules/interview-knowledge/queries";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { ExperienceEditor } from "@/app/faq/knowledge-forms";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";
import { FaqCard } from "@/app/faq/faq-card";

export const dynamic = "force-dynamic";

export default async function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  const [view, experienceOptions] = await Promise.all([
    getExperienceDetail(actor.userId, id).catch((error: unknown) => {
      if (isDomainNotFoundError(error)) notFound();
      throw error;
    }),
    getExperienceOptions(actor.userId),
  ]);
  return <main className="page-stack"><Link className="back-link" href="/faq?view=experiences"><ArrowLeft size={16} />返回经历视图</Link><header className="page-heading"><div><p className="eyebrow">Experience</p><h1>{view.experience.name}</h1><p className="page-description">{view.faqs.length} 条历史 FAQ · {view.resumes.length} 个简历版本正在使用</p></div></header>
    <section className="surface-card detail-section experience-content"><p>{view.experience.content}</p>{view.resumes.length > 0 && <div className="resume-tags">{view.resumes.map((resume) => <span key={resume.id}>{resume.name}</span>)}</div>}<ExperienceEditor experience={view.experience} /></section>
    <section className="experience-faq-section"><div className="section-title-row"><div><p className="eyebrow">问题积累</p><h2>围绕该经历被问过什么？</h2></div></div><div className="faq-card-list faq-card-list-expanded">{view.faqs.map((faq) => <FaqCard key={faq.id} faq={{ ...faq, experienceName: view.experience.name }} experiences={experienceOptions} faqCategories={view.faqCategories} />)}</div></section>
  </main>;
}
