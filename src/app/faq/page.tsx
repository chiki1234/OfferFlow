import Link from "next/link";
import { ArrowLeft, CircleHelp, FolderOpen, Layers3 } from "lucide-react";
import { normalizeFaqLibraryFilters } from "@/modules/interview-knowledge/faq-filters";
import { buildFaqViewHref, buildGeneralFaqGroupHref, groupGeneralFaqs } from "@/modules/interview-knowledge/faq-views";
import { getKnowledgeLibrary } from "@/modules/interview-knowledge/queries";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { FaqCard } from "./faq-card";
import { getActiveFaqImportBatch } from "@/modules/interview-knowledge/faq-import";
import { DeleteExperienceButton, ExperienceCreateButton, FaqCreateButton, ManageResumeExperienceButton } from "./knowledge-actions";

export const dynamic = "force-dynamic";

export default async function FaqPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const actor = await getCurrentActor();
  const requestedView = first(params.view);
  const activeView = requestedView === "experiences" || requestedView === "general" ? requestedView : "questions";
  const requestedFilters = {
    query: first(params.q),
    binding: first(params.binding),
    experienceId: first(params.experienceId),
    category: first(params.category),
    settings: first(params.settings),
  };
  // Group over every unbound FAQ, like the experience overview; preserve question filters only for navigation.
  const library = await getKnowledgeLibrary(actor.userId, activeView === "general" ? { binding: "unbound" } : requestedFilters);
  const navigationFilters = normalizeFaqLibraryFilters(requestedFilters, library.faqCategories, library.experiences.map((experience) => experience.id));
  const generalGroups = activeView === "general" ? groupGeneralFaqs(library.faqs, library.faqCategories) : [];
  const selectedGroup = generalGroups.find((group) => first(params.uncategorized) === "1"
    ? group.category === null
    : group.category !== null && group.category === first(params.group));
  const activeImport = await getActiveFaqImportBatch(actor.userId);
  const imported = first(params.imported);
  const merged = first(params.merged);
  const showImportResult = /^\d{1,3}$/.test(imported ?? "") && /^\d{1,3}$/.test(merged ?? "");
  const hasFaqFilters = Boolean(library.filters.query || library.filters.binding || library.filters.experienceId || library.filters.category || library.filters.settings);
  return <main className={`page-stack page-stack-compact${activeView === "questions" ? " faq-questions-page" : ""}`}>
    {showImportResult && <p className="faq-resume-banner" role="status">导入已完成：新增 {imported} 条 FAQ，合并 {merged} 次出现。次数与来源面试已同步更新。</p>}
    {activeImport && <Link className="faq-resume-banner" href={`/faq/import-review/${activeImport.id}`}>你有一个未完成的 FAQ 导入批次 · 点击继续{activeImport.status === "review" ? "复核" : "处理"} →</Link>}
    <section className="knowledge-stats">
      <article><strong>{library.totalFaqCount}</strong><span>历史 FAQ</span></article>
      <article><strong>{library.experiences.length}</strong><span>项经历</span></article>
      <article><strong>{library.interviews.length}</strong><span>可复盘面试</span></article>
    </section>

    <nav aria-label="知识库视图" className="knowledge-tab-toolbar">
      <div className="tab-list">
        <Link aria-current={activeView === "questions" ? "page" : undefined} className={activeView === "questions" ? "active" : ""} href={buildFaqViewHref(navigationFilters, "questions")}><CircleHelp size={16} />问题视图</Link>
        <Link aria-current={activeView === "experiences" ? "page" : undefined} className={activeView === "experiences" ? "active" : ""} href={buildFaqViewHref(navigationFilters, "experiences")}><Layers3 size={16} />经历视图</Link>
        <Link aria-current={activeView === "general" ? "page" : undefined} className={activeView === "general" ? "active" : ""} href={buildFaqViewHref(navigationFilters, "general")}><FolderOpen size={16} />综合问题</Link>
      </div>
      <div className="knowledge-create-actions"><FaqCreateButton experiences={library.experiences} faqCategories={library.faqCategories} interviews={library.interviews} /><ExperienceCreateButton /></div>
    </nav>

    <div className="knowledge-layout">
      <section className="knowledge-main">
        {activeView === "questions" ? <>
          <div className="section-title-row"><div><p className="eyebrow">问题视图</p><h2>面试 FAQ</h2></div><CircleHelp size={20} /></div>
          <form className="surface-card faq-filter-bar" method="get"><label><span>搜索</span><input name="q" defaultValue={library.filters.query} placeholder="搜索问题或答案" /></label><label><span>是否绑定经历</span><select name="binding" defaultValue={library.filters.binding ?? ""}><option value="">全部</option><option value="bound">已绑定经历</option><option value="unbound">未绑定经历</option></select></label><label><span>选择经历</span><select name="experienceId" defaultValue={library.filters.experienceId ?? ""}><option value="">全部经历</option>{library.experiences.map((experience) => <option key={experience.id} value={experience.id}>{experience.name}</option>)}</select></label><label><span>选择分类</span><select name="category" defaultValue={library.filters.category ?? ""}><option value="">全部分类</option>{library.faqCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>设置状态</span><select name="settings" defaultValue={library.filters.settings ?? ""}><option value="">全部状态</option><option value="incomplete">需要补充</option><option value="complete">已完整</option></select></label><button className="primary-button" type="submit">筛选</button><Link className="filter-reset" href="/faq">清除</Link></form>
          {hasFaqFilters && <p className="filter-summary">找到 {library.faqs.length} 条匹配 FAQ</p>}
          {library.faqs.length ? <div className="faq-card-list">{library.faqs.map((faq) => <FaqCard key={faq.id} faq={faq} experiences={library.experiences} faqCategories={library.faqCategories} />)}</div> : <div className="surface-card empty-state jobs-empty"><span className="empty-icon"><CircleHelp size={22} /></span><div><strong>{library.totalFaqCount ? "没有匹配的问题" : "知识库还没有问题"}</strong><p>{library.totalFaqCount ? "调整搜索词或筛选条件后再试。" : "点击“新增 FAQ”开始录入。"}</p></div></div>}
        </> : activeView === "experiences" ? <>
          <div className="section-title-row"><div><p className="eyebrow">经历视图</p><h2>Experience Library</h2></div><div className="section-actions"><Layers3 size={20} /><ManageResumeExperienceButton experiences={library.experiences} resumes={library.resumes} /></div></div>
          <div className="experience-grid">{library.experiences.map((item) => <article className="surface-card experience-card" key={item.id}><Link className="experience-card-link" href={`/experiences/${item.id}`}><div className="experience-card-heading"><strong>{item.name}</strong><span>{item.faqCount} FAQ</span></div><p>{item.content}</p></Link><div className="experience-card-actions"><DeleteExperienceButton experience={item} /></div></article>)}{!library.experiences.length && <p className="detail-note">新增第一项经历，FAQ 才能跨简历版本持续积累。</p>}</div>
        </> : <>
          {selectedGroup && <Link className="back-link" href={buildFaqViewHref(navigationFilters, "general")}><ArrowLeft size={16} />返回综合问题</Link>}
          <div className="section-title-row"><div><p className="eyebrow">综合问题</p><h2>{selectedGroup ? selectedGroup.name : "按分类浏览 FAQ"}</h2></div><FolderOpen size={20} /></div>
          {selectedGroup ? <>
            <p className="filter-summary">{selectedGroup.faqs.length} 条未绑定经历的 FAQ</p>
            {selectedGroup.faqs.length ? <div className="faq-card-list faq-card-list-expanded">{selectedGroup.faqs.map((faq) => <FaqCard key={faq.id} faq={faq} experiences={library.experiences} faqCategories={library.faqCategories} />)}</div>
              : <div className="surface-card empty-state jobs-empty"><span className="empty-icon"><CircleHelp size={22} /></span><div><strong>该分类还没有问题</strong><p>将未绑定经历的 FAQ 设置为该分类后，会显示在这里。</p></div></div>}
          </> : <>
            <p className="filter-summary">{library.faqs.length} 条未绑定经历的 FAQ，按分类聚合。</p>
            <div className="experience-grid">{generalGroups.map((group) => <Link className="surface-card experience-card faq-category-card" key={group.category === null ? "uncategorized" : `category:${group.category}`} href={buildGeneralFaqGroupHref(navigationFilters, group.category)}>
              <div className="experience-card-heading"><strong>{group.name}</strong><span>{group.faqs.length} FAQ</span></div>
              <p>{group.faqs.length ? group.faqs.slice(0, 3).map((faq) => faq.question).join(" · ") : group.category === null ? "尚未设置分类的问题会汇总在这里。" : "暂无问题，设置为此分类的 FAQ 会汇总在这里。"}</p>
            </Link>)}</div>
          </>}
        </>}
      </section>

    </div>
  </main>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
