import { describe, expect, it } from "vitest";
import {
  analyzeFaqSimilarity,
  type FaqSimilarityGateway,
  type FaqSimilarityRequest,
} from "@/modules/interview-knowledge/faq-ai";

describe("analyzeFaqSimilarity", () => {
  it("按导入顺序逐条等待 AI 返回，不并发或合并发送新问题", async () => {
    const events: string[] = [];
    const gateway: FaqSimilarityGateway = {
      async findClosestMatches(request) {
        const ids = request.incoming.map((item) => item.id).join(",");
        events.push(`start:${ids}`);
        await Promise.resolve();
        events.push(`finish:${ids}`);
        return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: request.candidates[0].id }));
      },
      async mergeAnswers() { throw new Error("不应生成答案"); },
    };
    const result = await analyzeFaqSimilarity({
      incoming: [
        { id: "new-a1", question: "A 的第一条新问法", experienceId: "a" },
        { id: "new-b1", question: "B 的新问法", experienceId: "b" },
        { id: "new-a2", question: "A 的第二条新问法", experienceId: "a" },
      ],
      existing: [
        { id: "old-a", question: "A 历史问题", experienceId: "a" },
        { id: "old-b", question: "B 历史问题", experienceId: "b" },
      ],
    }, gateway);
    expect(events).toEqual([
      "start:new-a1", "finish:new-a1",
      "start:new-b1", "finish:new-b1",
      "start:new-a2", "finish:new-a2",
    ]);
    expect(result).toEqual([
      { incomingFaqId: "new-a1", existingFaqId: "old-a" },
      { incomingFaqId: "new-b1", existingFaqId: "old-b" },
      { incomingFaqId: "new-a2", existingFaqId: "old-a" },
    ]);
  });

  it("只在同一经历或均未绑定的范围内比较待导入问题", async () => {
    const requests: FaqSimilarityRequest[] = [];
    const gateway: FaqSimilarityGateway = {
      async findClosestMatches(request) {
        requests.push(request);
        return request.incoming.map((item) => ({
          incomingFaqId: item.id,
          existingFaqId: request.candidates[0]?.id ?? null,
        }));
      },
      async mergeAnswers() {
        throw new Error("本测试不会生成合并答案");
      },
    };

    const result = await analyzeFaqSimilarity({
      incoming: [
        { id: "new-a", question: "A 经历的新问法", experienceId: "experience-a" },
        { id: "new-b", question: "B 经历的新问法", experienceId: "experience-b" },
        { id: "new-general", question: "未绑定的新问法", experienceId: null },
        { id: "new-empty", question: "没有可比较历史的问题", experienceId: "experience-c" },
      ],
      existing: [
        { id: "old-a", question: "A 经历的历史问法", experienceId: "experience-a" },
        { id: "old-b", question: "B 经历的历史问法", experienceId: "experience-b" },
        { id: "old-general", question: "未绑定的历史问法", experienceId: null },
      ],
    }, gateway);

    expect(requests).toEqual([
      {
        incoming: [{ id: "new-a", question: "A 经历的新问法" }],
        candidates: [{ id: "old-a", question: "A 经历的历史问法" }],
      },
      {
        incoming: [{ id: "new-b", question: "B 经历的新问法" }],
        candidates: [{ id: "old-b", question: "B 经历的历史问法" }],
      },
      {
        incoming: [{ id: "new-general", question: "未绑定的新问法" }],
        candidates: [{ id: "old-general", question: "未绑定的历史问法" }],
      },
    ]);
    expect(result).toEqual([
      { incomingFaqId: "new-a", existingFaqId: "old-a" },
      { incomingFaqId: "new-b", existingFaqId: "old-b" },
      { incomingFaqId: "new-general", existingFaqId: "old-general" },
      { incomingFaqId: "new-empty", existingFaqId: null },
    ]);
  });

  it("拒绝 AI 返回当前比较范围之外的 FAQ", async () => {
    const gateway: FaqSimilarityGateway = {
      async findClosestMatches(request) {
        return request.incoming.map((item) => ({ incomingFaqId: item.id, existingFaqId: "another-user-faq" }));
      },
      async mergeAnswers() {
        throw new Error("本测试不会生成合并答案");
      },
    };

    await expect(analyzeFaqSimilarity({
      incoming: [{ id: "new-a", question: "新的问法", experienceId: "experience-a" }],
      existing: [{ id: "old-a", question: "历史问法", experienceId: "experience-a" }],
    }, gateway)).rejects.toThrow("AI_RESPONSE_INVALID");
  });

  it("后一条分析失败时，前一条结果已交给调用方保存", async () => {
    const saved: Array<{ incomingFaqId: string; existingFaqId: string | null }> = [];
    const gateway: FaqSimilarityGateway = {
      async findClosestMatches(request) {
        if (request.incoming[0].id === "second") throw new Error("provider unavailable");
        return [{ incomingFaqId: "first", existingFaqId: "existing" }];
      },
      async mergeAnswers() { throw new Error("不应生成答案"); },
    };
    await expect(analyzeFaqSimilarity({
      incoming: [
        { id: "first", question: "第一条", experienceId: null },
        { id: "second", question: "第二条", experienceId: null },
      ],
      existing: [{ id: "existing", question: "历史问题", experienceId: null }],
    }, gateway, async (match) => { saved.push(match); })).rejects.toThrow("provider unavailable");
    expect(saved).toEqual([{ incomingFaqId: "first", existingFaqId: "existing" }]);
  });
});
