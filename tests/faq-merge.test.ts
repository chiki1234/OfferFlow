import { expect, it } from "vitest";
import { prepareFaqMerge } from "@/modules/interview-knowledge/faq-merge";

it("多条新问法合入同一 FAQ 时累加出现次数并保留确定的问法顺序", () => {
  expect(prepareFaqMerge({ question: "怎样设计缓存？", frequency: 3 }, [
    { question: "缓存方案是什么？" },
    { question: "怎样设计缓存？" },
  ], "采用分层缓存。 ")).toEqual({
    question: "怎样设计缓存？ / 缓存方案是什么？",
    answer: "采用分层缓存。",
    frequency: 5,
    addedOccurrences: 2,
  });
});
