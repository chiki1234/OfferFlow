// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaqImportReview } from "../src/app/faq/import-review/[id]/review";

const { confirmImport, generateAnswer, router } = vi.hoisted(() => ({
  confirmImport: vi.fn(), generateAnswer: vi.fn(), router: { replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../src/app/faq/import-actions", () => ({ confirmFaqImport: confirmImport, generateFaqAnswer: generateAnswer }));

type Review = ComponentProps<typeof FaqImportReview>["review"];
const item = (id: string): Review["items"][number] => ({ id, question: `导入问题 ${id}`, answer: `导入答案 ${id}`, binding: "unbound", category: null, experienceId: null, experienceName: null, sourceInterviewId: null, sourceInterviewLabel: "无来源面试" });
const target = (id: string): Review["targets"][number] => ({ id, question: `已有问题 ${id}`, answer: `已有答案 ${id}`, category: "综合能力", experienceId: null, experienceName: null, frequency: 2, updatedAt: "2026-09-04T00:00:00.000Z" });
const fixture = (): Review => ({
  id: "batch", status: "review", errorMessage: null, sourceInterviewId: null,
  items: [item("one"), item("two"), item("three"), item("four")],
  targets: [target("first"), target("second")],
  matches: [{ incomingFaqId: "one", existingFaqId: "first" }, { incomingFaqId: "two", existingFaqId: "first" }, { incomingFaqId: "three", existingFaqId: "second" }, { incomingFaqId: "four", existingFaqId: null }],
});
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  confirmImport.mockResolvedValue({ error: null, result: { importedCount: 2, mergedCount: 2 } });
  generateAnswer.mockResolvedValue({ error: null, answer: "AI 合并答案内容" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(review = fixture()) {
  await act(async () => root.render(createElement(FaqImportReview, { review })));
}
function button(text: string, scope: ParentNode = container) {
  const result = Array.from(scope.querySelectorAll("button")).find((candidate) => candidate.textContent === text);
  expect(result, `button ${text}`).toBeDefined();
  return result!;
}
async function click(text: string, scope?: ParentNode) {
  await act(async () => button(text, scope).click());
}
async function goTo(index: number) {
  const select = container.querySelector("select")!;
  await act(async () => { select.value = String(index); select.dispatchEvent(new Event("change", { bubbles: true })); });
}
function decision(question: number) {
  return container.querySelector(`[aria-label="问题 ${question} 的处理方式"]`)!;
}
async function editAnswer(value: string) {
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("FAQ import review decisions", () => {
  it("keeps mixed decisions and an edited answer when moving between groups, then submits every item exactly once", async () => {
    await render();
    expect(container.querySelectorAll("fieldset")).toHaveLength(1);
    expect(button("确认导入 4 条记录").disabled).toBe(true);
    await click("合并到已有 FAQ", decision(1));
    await click("作为新 FAQ", decision(2));
    expect(container.querySelector("textarea")).toBeNull();
    await click("调整答案 / 查看详情");
    await editAnswer("最终整理的答案");
    await click("已选择合并", decision(1));
    expect(container.querySelector("textarea")?.value).toBe("最终整理的答案");
    await click("处理下一组待办");
    expect(container.querySelector("fieldset")?.getAttribute("aria-label")).toBe("处理第 2 组");
    expect(document.activeElement).toBe(container.querySelector("select"));
    await click("合并到已有 FAQ", decision(3));
    await goTo(0);
    expect(container.querySelector("textarea")?.value).toBe("最终整理的答案");
    expect(button("已选择新建", decision(2)).getAttribute("aria-pressed")).toBe("true");
    await click("收起详情");
    await click("确认导入 4 条记录");
    expect(confirmImport).toHaveBeenCalledWith("batch", {
      newItemIds: ["two", "four"],
      merges: [
        { targetFaqId: "first", itemIds: ["one"], answer: "最终整理的答案", expectedUpdatedAt: fixture().targets[0].updatedAt },
        { targetFaqId: "second", itemIds: ["three"], answer: "已有答案 second", expectedUpdatedAt: fixture().targets[1].updatedAt },
      ],
    });
    expect(router.replace).toHaveBeenCalledWith("/faq?imported=2&merged=2");
  });

  it("keeps AI generation associated with its group and prevents submission while another group is generating", async () => {
    const pending = Promise.withResolvers<{ error: null; answer: string }>();
    generateAnswer.mockReturnValueOnce(pending.promise);
    await render();
    await click("全部合并 · 保留已有答案");
    await click("调整答案 / 查看详情");
    await click("AI 合并答案");
    expect(generateAnswer).toHaveBeenCalledWith("batch", "first", ["one", "two"]);
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    await goTo(1);
    expect(container.querySelector("fieldset")?.disabled).toBe(false);
    expect(button("确认导入 4 条记录").disabled).toBe(true);
    await act(async () => pending.resolve({ error: null, answer: "后台生成的合并答案" }));
    await goTo(0);
    expect(container.querySelector("textarea")?.value).toBe("后台生成的合并答案");
    await click("确认导入 4 条记录");
    expect(confirmImport.mock.calls[0][1].merges[0]).toMatchObject({ targetFaqId: "first", answer: "后台生成的合并答案", itemIds: ["one", "two"] });
  });

  it("can use an incoming answer after AI fails and clears stale generated answers when the merge selection changes", async () => {
    generateAnswer.mockResolvedValueOnce({ error: "AI 暂不可用" });
    await render();
    await click("全部合并 · 保留已有答案");
    await click("调整答案 / 查看详情");
    await click("AI 合并答案");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("AI 暂不可用");
    await click("问题 1 的答案");
    expect(container.querySelector("textarea")?.value).toBe("导入答案 one");
    await click("作为新 FAQ", decision(1));
    expect(container.querySelector("textarea")?.value).toBe("已有答案 first");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await click("确认导入 4 条记录");
    expect(confirmImport.mock.calls[0][1]).toMatchObject({ newItemIds: ["one", "four"], merges: [{ targetFaqId: "first", itemIds: ["two"], answer: "已有答案 first" }, { targetFaqId: "second" }] });
  });

  it("applies bulk actions to all groups and resets answers when explicitly keeping existing answers", async () => {
    await render();
    await click("全部合并 · 保留已有答案");
    await click("调整答案 / 查看详情");
    await editAnswer("待重置答案");
    await click("全部合并 · 保留已有答案");
    expect(container.querySelector("textarea")?.value).toBe("已有答案 first");
    await click("全部作为新 FAQ");
    expect(container.querySelector("textarea")).toBeNull();
    await click("确认导入 4 条记录");
    expect(confirmImport).toHaveBeenCalledWith("batch", { newItemIds: ["one", "two", "three", "four"], merges: [] });
  });

  it("shows unmatched questions for a batch with no matches and still waits for confirmation", async () => {
    const review = { ...fixture(), targets: [], matches: [], items: [item("one")] };
    await render(review);
    expect(container.querySelector("fieldset")).toBeNull();
    expect(container.querySelector("details")?.open).toBe(true);
    expect(container.textContent).toContain("未发现相似问题");
    expect(confirmImport).not.toHaveBeenCalled();
    await click("确认导入 1 条记录");
    expect(confirmImport).toHaveBeenCalledWith("batch", { newItemIds: ["one"], merges: [] });
  });
});
