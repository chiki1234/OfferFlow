import { describe, expect, it } from "vitest";
import { normalizeFaqLibraryFilters } from "@/modules/interview-knowledge/faq-filters";
import { buildFaqViewHref, buildGeneralFaqGroupHref, groupGeneralFaqs } from "@/modules/interview-knowledge/faq-views";

describe("综合问题分类浏览", () => {
  it("仅聚合未绑定经历的 FAQ，保留配置顺序、空分类与未分类", () => {
    const groups = groupGeneralFaqs([
      { id: "bound", category: null, experienceId: "experience-1" },
      { id: "one", category: "沟通", experienceId: null },
      { id: "two", category: "沟通", experienceId: null },
      { id: "uncategorized", category: null, experienceId: null },
    ], ["技术", "沟通"]);
    expect(groups.map((group) => [group.category, group.faqs.map((faq) => faq.id)])).toEqual([
      ["技术", []], ["沟通", ["one", "two"]], [null, ["uncategorized"]],
    ]);
  });

  it("不会遗漏历史分类，也不将名为未分类的自定义分类与空分类混淆", () => {
    const groups = groupGeneralFaqs([
      { id: "custom", category: "未分类", experienceId: null },
      { id: "old", category: "旧分类", experienceId: null },
      { id: "empty", category: null, experienceId: null },
    ], ["未分类"]);
    expect(groups.map((group) => [group.category, group.faqs[0].id])).toEqual([
      ["未分类", "custom"], ["旧分类", "old"], [null, "empty"],
    ]);
  });

  it("分类导航安全编码名称，同时保留问题视图的筛选条件", () => {
    const filters = normalizeFaqLibraryFilters({ query: "Agent & RAG", experienceId: "experience-1", settings: "complete" }, [], ["experience-1"]);
    const groupUrl = new URL(buildGeneralFaqGroupHref(filters, "系统 / 设计 & A+B"), "http://localhost");
    expect(Object.fromEntries(groupUrl.searchParams)).toEqual({
      view: "general", q: "Agent & RAG", binding: "bound", experienceId: "experience-1", settings: "complete", group: "系统 / 设计 & A+B",
    });
    expect(buildGeneralFaqGroupHref(filters, null)).toContain("&uncategorized=1");
    expect(buildFaqViewHref(filters, "questions")).not.toContain("view=");
    expect(buildFaqViewHref(filters, "experiences")).toContain("view=experiences");
  });
});
