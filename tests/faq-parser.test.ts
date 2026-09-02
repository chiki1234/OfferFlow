import { describe, expect, it } from "vitest";
import { parseFaqBlocks } from "@/modules/interview-knowledge/faq-parser";
import { isFaqSettingsComplete, validateFaqBatch } from "@/modules/interview-knowledge/faq-batch";

describe("parseFaqBlocks", () => {
  it("按独立分隔线拆分 Block 并保留多行答案", () => {
    const parsed = parseFaqBlocks(`Q: 为什么拆成 6 个 Agent？
A: 因为要分离职责。
还能独立验证。

---

Q: Writer 和 Critic 为什么分开？
A: 避免自我评价偏差。`);

    expect(parsed).toEqual([
      { index: 0, status: "valid", question: "为什么拆成 6 个 Agent？", answer: "因为要分离职责。\n还能独立验证。", raw: expect.any(String) },
      { index: 1, status: "valid", question: "Writer 和 Critic 为什么分开？", answer: "避免自我评价偏差。", raw: expect.any(String) },
    ]);
  });

  it("过滤不含 Q 的内容，不影响其他 FAQ", () => {
    const parsed = parseFaqBlocks("Q: 正常问题\nA: 正常答案\n---\n只有一段普通文字\n---\nQ: 第二个问题\nA: 第二个答案");

    expect(parsed).toHaveLength(2);
    expect(parsed.map((block) => block.status)).toEqual(["valid", "valid"]);
  });

  it("识别 Markdown 标题、中文冒号和混合冒号", () => {
    const parsed = parseFaqBlocks(`# 面试 FAQ 汇总

> 这段说明不属于 FAQ。

------

## 通用与职业规划

### Q：请先做一个简单的自我介绍。/ 请简单介绍一下自己。

A：第一段答案。

第二段答案。

------

## 求职动机

### Q：为什么不考虑研发岗位？

A: 更希望连接技术和业务。`);

    expect(parsed).toEqual([
      {
        index: 0,
        status: "valid",
        question: "请先做一个简单的自我介绍。/ 请简单介绍一下自己。",
        answer: "第一段答案。\n\n第二段答案。",
        raw: expect.any(String),
      },
      {
        index: 1,
        status: "valid",
        question: "为什么不考虑研发岗位？",
        answer: "更希望连接技术和业务。",
        raw: expect.any(String),
      },
    ]);
  });

  it("只有 Q 没有 A 也会生成答案为空的有效 FAQ", () => {
    expect(parseFaqBlocks("Q: 问题")).toEqual([
      { index: 0, status: "valid", question: "问题", answer: "", raw: "Q: 问题" },
    ]);
  });
});

describe("validateFaqBatch", () => {
  it("未绑定经历时允许分类留空，并自动派生为综合问题", () => {
    expect(validateFaqBatch([{ question: "待整理问题？", answer: "", binding: "unbound", category: null, experienceId: null }])).toEqual([
      { question: "待整理问题？", answer: "", kind: "general", category: null, experienceId: null },
    ]);
    expect(validateFaqBatch([{ question: "如何协作？", answer: "对齐目标", binding: "unbound", category: "协作沟通", experienceId: null }])).toEqual([
      { question: "如何协作？", answer: "对齐目标", kind: "general", category: "协作沟通", experienceId: null },
    ]);
  });

  it("绑定经历时要求具体经历、不接受分类，并自动派生为经历问题", () => {
    expect(validateFaqBatch([{ question: "项目目标？", answer: "提升效率", binding: "bound", category: null, experienceId: "experience-1" }])).toEqual([
      { question: "项目目标？", answer: "提升效率", kind: "experience", category: null, experienceId: "experience-1" },
    ]);
    expect(() => validateFaqBatch([{ question: "项目目标？", answer: "提升效率", binding: "bound", category: null, experienceId: null }])).toThrow("VALIDATION_ERROR");
    expect(() => validateFaqBatch([{ question: "项目目标？", answer: "提升效率", binding: "bound", category: "技术实现", experienceId: "experience-1" }])).toThrow("VALIDATION_ERROR");
  });

  it("未绑定经历时不允许携带经历", () => {
    expect(() => validateFaqBatch([{ question: "为什么离职？", answer: "寻求成长", binding: "unbound", category: "求职动机", experienceId: "experience-1" }])).toThrow("VALIDATION_ERROR");
  });

  it("只有未绑定且未分类的 FAQ 需要补充设置", () => {
    expect(isFaqSettingsComplete({ category: null, experienceId: null })).toBe(false);
    expect(isFaqSettingsComplete({ category: null, experienceId: "experience-1" })).toBe(true);
    expect(isFaqSettingsComplete({ category: "协作沟通", experienceId: null })).toBe(true);
  });
});
