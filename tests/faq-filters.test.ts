import { describe, expect, it } from "vitest";
import { normalizeFaqLibraryFilters } from "@/modules/interview-knowledge/faq-filters";

describe("normalizeFaqLibraryFilters", () => {
  it("清理搜索词并接受系统支持的类型与分类", () => {
    expect(normalizeFaqLibraryFilters({ query: "  Agent 拆分  ", kind: "experience", category: "技术实现" })).toEqual({
      query: "Agent 拆分",
      kind: "experience",
      category: "技术实现",
    });
  });

  it("忽略未知筛选值并限制搜索词长度", () => {
    expect(normalizeFaqLibraryFilters({ query: "a".repeat(150), kind: "unknown", category: "自定义分类" })).toEqual({
      query: "a".repeat(100),
      kind: null,
      category: null,
    });
  });
});
