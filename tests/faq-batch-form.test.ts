// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaqBatchForm } from "../src/app/faq/knowledge-forms";

const { commit, beginAnalysis, importEdited } = vi.hoisted(() => ({ commit: vi.fn(), beginAnalysis: vi.fn(), importEdited: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../src/app/faq/actions", () => ({
  commitFaqBatchAction: commit, createExperienceAction: vi.fn(), createFaqCategoryAction: vi.fn(),
  deleteFaqAction: vi.fn(), deleteFaqCategoryAction: vi.fn(), renameFaqCategoryAction: vi.fn(),
  setResumeExperiencesAction: vi.fn(), updateExperienceAction: vi.fn(), updateFaqAction: vi.fn(),
}));
vi.mock("../src/app/faq/import-actions", () => ({ beginFaqAnalysis: beginAnalysis, importEditedFaqBatch: importEdited }));

let root: Root;
let container: HTMLDivElement;
const scrollIntoView = vi.fn();
const props = {
  token: "test-import-token",
  interviews: [{ id: "interview-1", companyName: "测试公司", roleName: "测试岗位", roundLabel: "一面" }],
  experiences: [{ id: "experience-1", name: "测试经历" }],
  faqCategories: ["协作沟通"],
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  Element.prototype.scrollIntoView = scrollIntoView;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  commit.mockResolvedValue({ error: null, success: "已导入 1 条 FAQ。" });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

async function renderForm(overrides: Partial<Parameters<typeof FaqBatchForm>[0]> = {}) {
  await act(async () => { root.render(createElement(FaqBatchForm, { ...props, ...overrides })); });
}

function source() { return container.querySelector<HTMLSelectElement>("select[name=interviewId]")!; }
function blocks() { return container.querySelector<HTMLTextAreaElement>("textarea")!; }
function submit() { return container.querySelector<HTMLButtonElement>("button[type=submit]")!; }
function drafts() { return Array.from(container.querySelectorAll("article")); }
function invalidFields() { return Array.from(container.querySelectorAll('[aria-invalid="true"], [data-invalid="true"]')); }
function choice() { return container.querySelector("dialog[open]"); }

async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
async function fill(element: HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLTextAreaElement ? "input" : "change", { bubbles: true }));
  });
}

describe("FAQ batch required-field feedback", () => {
  it("defaults the source to empty and marks every empty field only after an enabled submit is clicked", async () => {
    await renderForm();
    expect(source().value).toBe("");
    expect(source().required).toBe(true);
    expect(submit().textContent).toBe("导入 FAQ");
    expect(submit().disabled).toBe(false);
    expect(invalidFields()).toEqual([]);
    await click(submit());
    expect(invalidFields()).toEqual([source(), blocks()]);
    expect(document.activeElement).toBe(source());
    expect(scrollIntoView.mock.contexts).toEqual([source()]);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(choice()).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(beginAnalysis).not.toHaveBeenCalled();
    expect(submit().disabled).toBe(false);
  });

  it("marks missing questions, binding choices, and conditional experiences together in visible order", async () => {
    await renderForm();
    await fill(blocks(), "Q: 问题一\n\nQ: 问题二");
    const [first, second] = drafts();
    const question = first.querySelector("textarea")!;
    const binding = first.querySelector("select")!;
    await fill(question, "   ");
    await fill(second.querySelector("select")!, "bound");
    const experience = second.querySelectorAll("select")[1];
    await click(submit());
    expect(invalidFields()).toEqual([source(), question, binding, experience]);
    await fill(source(), "interview-1");
    expect(source().getAttribute("aria-invalid")).toBe("false");
    await click(submit());
    expect(document.activeElement).toBe(question);
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(question);
    await fill(question, "补齐问题");
    await fill(binding, "unbound");
    await click(submit());
    expect(invalidFields()).toEqual([experience]);
    expect(document.activeElement).toBe(experience);
    await fill(experience, "experience-1");
    expect(invalidFields()).toEqual([]);
    await click(submit());
    expect(choice()?.textContent).toContain("先检查重复 FAQ？");
    expect(commit).not.toHaveBeenCalled();
    expect(beginAnalysis).not.toHaveBeenCalled();
  });

  it("ignores unselected incomplete drafts and permits empty answers and optional categories", async () => {
    await renderForm();
    await fill(source(), "interview-1");
    await fill(blocks(), "Q: 导入的问题\n\nQ: 不导入的问题");
    const [first, second] = drafts();
    await fill(first.querySelector("select")!, "unbound");
    await fill(second.querySelector("textarea")!, "");
    await click(second.querySelector("input")!);
    await click(submit());
    expect(invalidFields()).toEqual([]);
    expect(choice()).not.toBeNull();
    await click(Array.from(choice()!.querySelectorAll("button")).find((button) => button.textContent === "不分析，直接导入")!);
    expect(commit).toHaveBeenCalledTimes(1);
    const data = commit.mock.calls[0][1] as FormData;
    expect(data.get("interviewId")).toBe("interview-1");
    expect(JSON.parse(String(data.get("itemsJson")))).toEqual([{ question: "导入的问题", answer: "", binding: "unbound", category: null, experienceId: null }]);
  });

  it("requires at least one selected FAQ and clears that error on selection", async () => {
    await renderForm();
    await fill(source(), "interview-1");
    await fill(blocks(), "Q: 待选择问题");
    await click(drafts()[0].querySelector("input")!);
    await click(submit());
    const selection = container.querySelector('[role="group"]');
    expect(invalidFields()).toEqual([selection]);
    expect(document.activeElement).toBe(selection);
    expect(container.textContent).toContain("请至少选择一条 FAQ");
    expect(choice()).toBeNull();
    expect(submit().disabled).toBe(false);
    await click(drafts()[0].querySelector("input")!);
    expect(selection?.getAttribute("data-invalid")).toBe("false");
  });

  it.each(["   ", "普通说明，没有 Q 标记", "Q:\nA: 只有答案"])("points to FAQ Blocks when no usable question exists: %s", async (raw) => {
    await renderForm();
    await fill(source(), "interview-1");
    await fill(blocks(), raw);
    await click(submit());
    expect(invalidFields()).toEqual([blocks()]);
    expect(document.activeElement).toBe(blocks());
    expect(choice()).toBeNull();
  });

  it("still skips invalid parsed blocks when other selected FAQs are complete", async () => {
    await renderForm();
    await fill(source(), "interview-1");
    await fill(blocks(), "Q:\nA: 无问题\n---\nQ: 有效问题");
    await fill(drafts()[0].querySelector("select")!, "unbound");
    await click(submit());
    expect(invalidFields()).toEqual([]);
    expect(choice()).not.toBeNull();
  });

  it("allows clicking without available interviews and explains how to proceed", async () => {
    await renderForm({ interviews: [] });
    expect(submit().disabled).toBe(false);
    expect(container.textContent).toContain("暂无可选面试，请先创建面试");
    await click(submit());
    expect(document.activeElement).toBe(source());
  });

  it.each([null, "removed-interview"])("requires a source for restored drafts without a selectable source: %s", async (sourceInterviewId) => {
    const items = [{ question: "恢复的问题", answer: "", binding: "unbound" as const, category: null, experienceId: null }];
    await renderForm({ initialDraft: { batchId: "batch-1", sourceInterviewId, items } });
    expect(source().value).toBe("");
    await click(submit());
    expect(invalidFields()).toEqual([source()]);
    await fill(source(), "interview-1");
    await click(submit());
    expect(choice()).not.toBeNull();
  });

  it("keeps the submit button clickable during saving without starting another import", async () => {
    const saving = Promise.withResolvers<{ error: null; success: string }>();
    commit.mockReturnValueOnce(saving.promise);
    await renderForm({ initialDraft: { batchId: "", sourceInterviewId: "interview-1", items: [{ question: "测试问题", answer: "", binding: "unbound", category: null, experienceId: null }] } });
    expect(source().value).toBe("interview-1");
    await click(submit());
    await click(Array.from(choice()!.querySelectorAll("button")).find((button) => button.textContent === "不分析，直接导入")!);
    expect(submit().disabled).toBe(false);
    expect(submit().getAttribute("aria-busy")).toBe("true");
    const waitingChoice = choice();
    await click(submit());
    expect(choice()).toBe(waitingChoice);
    expect(commit).toHaveBeenCalledTimes(1);
    await act(async () => { saving.resolve({ error: null, success: "已导入。" }); });
    expect(choice()).toBeNull();
  });

  it("respects reduced motion when moving to the first missing field", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    await renderForm();
    await click(submit());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "center" });
  });
});
