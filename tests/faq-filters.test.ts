import { describe, expect, it } from "vitest";
import { normalizeFaqLibraryFilters } from "@/modules/interview-knowledge/faq-filters";

describe("normalizeFaqLibraryFilters", () => {
  it("清理搜索词并接受绑定状态与未绑定问题分类", () => {
    expect(normalizeFaqLibraryFilters({ query: "  Agent 拆分  ", binding: "unbound", category: "协作沟通" })).toEqual({
      query: "Agent 拆分",
      binding: "unbound",
      experienceId: null,
      category: "协作沟通",
      settings: null,
    });
  });

  it("忽略未知筛选值并限制搜索词长度", () => {
    expect(normalizeFaqLibraryFilters({ query: "a".repeat(150), binding: "unknown", category: "自定义分类" })).toEqual({
      query: "a".repeat(100),
      binding: null,
      experienceId: null,
      category: null,
      settings: null,
    });
  });

  it("接受 FAQ 设置完整度筛选", () => {
    expect(normalizeFaqLibraryFilters({ settings: "incomplete" }).settings).toBe("incomplete");
    expect(normalizeFaqLibraryFilters({ settings: "complete" }).settings).toBe("complete");
    expect(normalizeFaqLibraryFilters({ settings: "unknown" }).settings).toBeNull();
  });

  it("使用当前用户的自定义分类校验筛选值", () => {
    expect(normalizeFaqLibraryFilters({ binding: "unbound", category: "系统设计" }, ["系统设计"])).toMatchObject({
      binding: "unbound",
      category: "系统设计",
    });
  });

  it("已绑定筛选会忽略只适用于未绑定问题的分类", () => {
    expect(normalizeFaqLibraryFilters({ binding: "bound", category: "协作沟通" })).toEqual({
      query: "",
      binding: "bound",
      experienceId: null,
      category: null,
      settings: null,
    });
  });

  it("仅接受当前用户经历，并让选择经历自动收敛为已绑定筛选", () => {
    expect(normalizeFaqLibraryFilters({ binding: "unbound", experienceId: "experience-a", category: "协作沟通" }, undefined, ["experience-a"])).toEqual({
      query: "",
      binding: "bound",
      experienceId: "experience-a",
      category: null,
      settings: null,
    });
    expect(normalizeFaqLibraryFilters({ experienceId: "other-user-experience" }, undefined, ["experience-a"])).toMatchObject({
      binding: null,
      experienceId: null,
    });
  });
});
