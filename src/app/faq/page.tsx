import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CircleHelp, Layers3 } from "lucide-react";
import { faqCategoryOptions } from "@/modules/interview-knowledge/faq-filters";
import { getKnowledgeLibrary } from "@/modules/interview-knowledge/queries";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { ExperienceForm, FaqBatchForm, FaqEditor, ResumeExperienceForm } from "./knowledge-forms";

export const dynamic = "force-dynamic";

export default async function FaqPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const actor = await getCurrentActor();
  const view = await getKnowledgeLibrary(actor.userId, {
    query: first(params.q),
    kind: first(params.kind),
    category: first(params.category),
  });
  return <main className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">面试知识</p><h1>让每一场面试，为下一场积累。</h1><p className="page-description">FAQ 按经历沉淀，并始终保留来源面试。</p></div></header>

    <section className="knowledge-stats">
      <article><strong>{view.totalFaqCount}</strong><span>历史 FAQ</span></article>
      <article><strong>{view.experiences.length}</strong><span>项经历</span></article>
      <article><strong>{view.interviews.length}</strong><span>可复盘面试</span></article>
    </section>

    <div className="knowledge-layout">
      <section className="knowledge-main">
        <div className="section-title-row"><div><p className="eyebrow">问题视图</p><h2>面试 FAQ</h2></div><CircleHelp size={20} /></div>
        <form className="surface-card faq-filter-bar" method="get"><label><span>搜索</span><input name="q" defaultValue={view.filters.query} placeholder="搜索问题或答案" /></label><label><span>类型</span><select name="kind" defaultValue={view.filters.kind ?? ""}><option value="">全部类型</option><option value="experience">经历问题</option><option value="general">综合问题</option></select></label><label><span>分类</span><select name="category" defaultValue={view.filters.category ?? ""}><option value="">全部分类</option>{faqCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><button className="primary-button" type="submit">筛选</button><Link className="filter-reset" href="/faq">清除</Link></form>
        {(view.filters.query || view.filters.kind || view.filters.category) && <p className="filter-summary">找到 {view.faqs.length} 条匹配 FAQ</p>}
        {view.faqs.length ? <div className="faq-card-list">{view.faqs.map((faq) => <article className="surface-card faq-card" key={faq.id}><div className="faq-card-meta"><span>{faq.category}</span><span>{faq.experienceName ?? "综合问题"}</span></div><h3>{faq.question}</h3><p>{faq.answer}</p><footer>来源：{faq.companyName} · {faq.roleName} · {faq.roundLabel}</footer><FaqEditor faq={faq} experiences={view.experiences} /></article>)}</div> : <div className="surface-card empty-state jobs-empty"><span className="empty-icon"><CircleHelp size={22} /></span><div><strong>{view.totalFaqCount ? "没有匹配的问题" : "知识库还没有问题"}</strong><p>{view.totalFaqCount ? "调整搜索词或筛选条件后再试。" : "完成面试后，可以一次粘贴多个 FAQ Block。"}</p></div></div>}

        <div className="section-title-row knowledge-subheading"><div><p className="eyebrow">经历视图</p><h2>Experience Library</h2></div><Layers3 size={20} /></div>
        <div className="experience-grid">{view.experiences.map((item) => <Link className="surface-card experience-card" href={`/experiences/${item.id}`} key={item.id}><strong>{item.name}</strong><span>{item.faqCount} FAQ</span><p>{item.content}</p></Link>)}{!view.experiences.length && <p className="detail-note">新增第一项经历，FAQ 才能跨简历版本持续积累。</p>}</div>
      </section>

      <aside className="surface-card knowledge-tools">
        <FaqBatchForm token={randomUUID()} interviews={view.interviews} experiences={view.experiences} />
        <ExperienceForm />
        <ResumeExperienceForm resumes={view.resumes} experiences={view.experiences} />
      </aside>
    </div>
  </main>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
