import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CircleHelp, Layers3 } from "lucide-react";
import { isFaqSettingsComplete } from "@/modules/interview-knowledge/faq-batch";
import { getKnowledgeLibrary } from "@/modules/interview-knowledge/queries";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { FaqAnswerDisclosure } from "./faq-answer-disclosure";
import { FaqEditor } from "./knowledge-forms";
import { DeleteExperienceButton, KnowledgeCreateButton, ManageResumeExperienceButton } from "./knowledge-actions";

export const dynamic = "force-dynamic";

export default async function FaqPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const actor = await getCurrentActor();
  const library = await getKnowledgeLibrary(actor.userId, {
    query: first(params.q),
    binding: first(params.binding),
    category: first(params.category),
    settings: first(params.settings),
  });
  const activeView = first(params.view) === "experiences" ? "experiences" : "questions";
  const hasFaqFilters = Boolean(library.filters.query || library.filters.binding || library.filters.category || library.filters.settings);
  return <main className="page-stack">
    <section className="knowledge-stats">
      <article><strong>{library.totalFaqCount}</strong><span>历史 FAQ</span></article>
      <article><strong>{library.experiences.length}</strong><span>项经历</span></article>
      <article><strong>{library.interviews.length}</strong><span>可复盘面试</span></article>
    </section>

    <nav aria-label="知识库视图" className="knowledge-tab-toolbar">
      <div className="tab-list">
        <Link aria-current={activeView === "questions" ? "page" : undefined} className={activeView === "questions" ? "active" : ""} href={buildViewHref(library.filters, "questions")}><CircleHelp size={16} />问题视图</Link>
        <Link aria-current={activeView === "experiences" ? "page" : undefined} className={activeView === "experiences" ? "active" : ""} href={buildViewHref(library.filters, "experiences")}><Layers3 size={16} />经历视图</Link>
      </div>
      <KnowledgeCreateButton experiences={library.experiences} faqCategories={library.faqCategories} interviews={library.interviews} token={randomUUID()} />
    </nav>

    <div className="knowledge-layout">
      <section className="knowledge-main">
        {activeView === "questions" ? <>
          <div className="section-title-row"><div><p className="eyebrow">问题视图</p><h2>面试 FAQ</h2></div><CircleHelp size={20} /></div>
          <form className="surface-card faq-filter-bar" method="get"><label><span>绑定状态</span><select name="binding" defaultValue={library.filters.binding ?? ""}><option value="">全部</option><option value="bound">已绑定经历</option><option value="unbound">未绑定经历</option></select></label><label><span>分类</span><select name="category" defaultValue={library.filters.category ?? ""}><option value="">全部分类</option>{library.faqCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>搜索</span><input name="q" defaultValue={library.filters.query} placeholder="搜索问题或答案" /></label><label><span>设置状态</span><select name="settings" defaultValue={library.filters.settings ?? ""}><option value="">全部状态</option><option value="incomplete">需要补充</option><option value="complete">已完整</option></select></label><button className="primary-button" type="submit">筛选</button><Link className="filter-reset" href="/faq">清除</Link></form>
          {hasFaqFilters && <p className="filter-summary">找到 {library.faqs.length} 条匹配 FAQ</p>}
          {library.faqs.length ? <div className="faq-card-list">{library.faqs.map((faq) => {
          const settingsComplete = isFaqSettingsComplete(faq);
          const settingLabel = faq.experienceId ? faq.experienceName ?? "已绑定经历" : faq.category ?? "暂不设置";
          return <article className="surface-card faq-card" key={faq.id}><div className={settingsComplete ? "faq-card-meta" : "faq-card-meta incomplete"}><span>{settingLabel}</span></div><h3>{faq.question}</h3><FaqAnswerDisclosure answer={faq.answer} question={faq.question} /><footer>来源：{faq.sourceInterviewId ? `${faq.companyName} · ${faq.roleName} · ${faq.roundLabel}` : "未关联面试"}</footer><FaqEditor faq={faq} experiences={library.experiences} faqCategories={library.faqCategories} incomplete={!settingsComplete} /></article>;
          })}</div> : <div className="surface-card empty-state jobs-empty"><span className="empty-icon"><CircleHelp size={22} /></span><div><strong>{library.totalFaqCount ? "没有匹配的问题" : "知识库还没有问题"}</strong><p>{library.totalFaqCount ? "调整搜索词或筛选条件后再试。" : "完成面试后，可以一次粘贴多个 FAQ Block。"}</p></div></div>}
        </> : <>
          <div className="section-title-row"><div><p className="eyebrow">经历视图</p><h2>Experience Library</h2></div><div className="section-actions"><Layers3 size={20} /><ManageResumeExperienceButton experiences={library.experiences} resumes={library.resumes} /></div></div>
          <div className="experience-grid">{library.experiences.map((item) => <article className="surface-card experience-card" key={item.id}><Link className="experience-card-link" href={`/experiences/${item.id}`}><div className="experience-card-heading"><strong>{item.name}</strong><span>{item.faqCount} FAQ</span></div><p>{item.content}</p></Link><div className="experience-card-actions"><DeleteExperienceButton experience={item} /></div></article>)}{!library.experiences.length && <p className="detail-note">新增第一项经历，FAQ 才能跨简历版本持续积累。</p>}</div>
        </>}
      </section>

    </div>
  </main>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildViewHref(filters: { query: string; binding: string | null; category: string | null; settings: string | null }, view: "questions" | "experiences") {
  const params = new URLSearchParams();
  if (view === "experiences") params.set("view", "experiences");
  if (filters.query) params.set("q", filters.query);
  if (filters.binding) params.set("binding", filters.binding);
  if (filters.category) params.set("category", filters.category);
  if (filters.settings) params.set("settings", filters.settings);
  const query = params.toString();
  return query ? `/faq?${query}` : "/faq";
}
