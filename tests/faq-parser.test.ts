import { describe, expect, it } from "vitest";
import { parseFaqBlocks } from "@/modules/interview-knowledge/faq-parser";
import { validateFaqBatch } from "@/modules/interview-knowledge/faq-batch";

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

  it("单个损坏 Block 只标记自身，不影响其他结果", () => {
    const parsed = parseFaqBlocks("Q: 正常问题\nA: 正常答案\n---\n只有一段普通文字\n---\nQ: 第二个问题\nA: 第二个答案");

    expect(parsed.map((block) => block.status)).toEqual(["valid", "invalid", "valid"]);
    expect(parsed[1]).toMatchObject({ index: 1, status: "invalid", error: "FAQ Block 需要同时包含 Q: 和 A:" });
  });
});

describe("validateFaqBatch", () => {
  it("经历问题必须绑定 Experience，综合问题不能绑定", () => {
    expect(() => validateFaqBatch([{ question: "项目目标？", answer: "提升效率", kind: "experience", category: "项目背景", experienceId: null }])).toThrow("VALIDATION_ERROR");
    expect(() => validateFaqBatch([{ question: "为什么离职？", answer: "寻求成长", kind: "general", category: "求职动机", experienceId: "experience-1" }])).toThrow("VALIDATION_ERROR");
    expect(validateFaqBatch([{ question: "如何协作？", answer: "对齐目标", kind: "general", category: "协作沟通", experienceId: null }])).toHaveLength(1);
  });
});
