import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FaqPage from "@/app/faq/page";
import { normalizeFaqLibraryFilters } from "@/modules/interview-knowledge/faq-filters";

const { getKnowledgeLibrary, getCurrentActor } = vi.hoisted(() => ({ getKnowledgeLibrary: vi.fn(), getCurrentActor: vi.fn() }));
vi.mock("@/modules/interview-knowledge/queries", () => ({ getKnowledgeLibrary }));
vi.mock("@/shared/actor/current-actor", () => ({ getCurrentActor }));
vi.mock("@/modules/interview-knowledge/faq-import", () => ({ getActiveFaqImportBatch: async () => null }));
vi.mock("@/app/faq/knowledge-actions", () => ({ DeleteExperienceButton: () => null, FaqCreateButton: () => null, ExperienceCreateButton: () => null, ManageResumeExperienceButton: () => null }));
vi.mock("@/app/faq/knowledge-forms", () => ({ FaqEditor: () => null }));

describe("知识库综合问题视图", () => {
  beforeEach(() => {
    getCurrentActor.mockResolvedValue({ userId: "user-1" });
    getKnowledgeLibrary.mockResolvedValue({
      filters: normalizeFaqLibraryFilters({ binding: "unbound" }),
      experiences: [{ id: "experience-1", name: "已有经历" }],
      faqCategories: ["技术", "协作"], totalFaqCount: 3, interviews: [], resumes: [],
      faqs: [
        { id: "faq-1", question: "技术问题", answer: "技术答案", category: "技术", experienceId: null, frequency: 2, sources: [] },
        { id: "faq-2", question: "未设置分类的问题", answer: "待分类答案", category: null, experienceId: null, frequency: 1, sources: [] },
      ],
    });
  });

  it("进入分类总览时使用当前用户的全部未绑定问题，不受问题视图经历筛选影响", async () => {
    const markup = renderToStaticMarkup(await FaqPage({ searchParams: Promise.resolve({ view: "general", binding: "bound", experienceId: "experience-1", q: "原搜索" }) }));
    expect(getKnowledgeLibrary).toHaveBeenCalledWith("user-1", { binding: "unbound" });
    expect(markup).toContain("按分类浏览 FAQ");
    expect(markup).toContain("2 条未绑定经历的 FAQ");
    expect(markup).toContain("&amp;group=");
    expect(markup).toContain("&amp;uncategorized=1");
    expect(markup).toContain("experienceId=experience-1");
    expect(markup.indexOf("问题视图</a>")).toBeLessThan(markup.indexOf("经历视图</a>"));
    expect(markup.indexOf("经历视图</a>")).toBeLessThan(markup.indexOf("综合问题</a>"));
  });

  it("点开分类仅展示该分类的问题，沿用默认折叠答案的 FAQ 卡片", async () => {
    const markup = renderToStaticMarkup(await FaqPage({ searchParams: Promise.resolve({ view: "general", group: "技术" }) }));
    expect(markup).toContain("技术问题");
    expect(markup).not.toContain("未设置分类的问题");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("技术答案");
    expect(markup).toContain("返回综合问题");
  });

  it("未分类入口只展示空分类，空分类组和失效分类链接均可正常访问", async () => {
    const uncategorized = renderToStaticMarkup(await FaqPage({ searchParams: Promise.resolve({ view: "general", uncategorized: "1" }) }));
    expect(uncategorized).toContain("未设置分类的问题");
    expect(uncategorized).not.toContain("技术问题");
    const empty = renderToStaticMarkup(await FaqPage({ searchParams: Promise.resolve({ view: "general", group: "协作" }) }));
    expect(empty).toContain("该分类还没有问题");
    const unknown = renderToStaticMarkup(await FaqPage({ searchParams: Promise.resolve({ view: "general", group: "不存在" }) }));
    expect(unknown).toContain("按分类浏览 FAQ");
  });
});
