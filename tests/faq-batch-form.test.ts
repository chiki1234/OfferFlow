// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaqEntryForm } from "../src/app/faq/faq-entry-form";

const { commit, beginAnalysis, importEdited } = vi.hoisted(() => ({ commit: vi.fn(), beginAnalysis: vi.fn(), importEdited: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../src/app/faq/actions", () => ({ commitFaqBatchAction: commit }));
vi.mock("../src/app/faq/import-actions", () => ({ beginFaqAnalysis: beginAnalysis, importEditedFaqBatch: importEdited }));
let root: Root;
let container: HTMLDivElement;
const props = { token: "test-import-token", interviews: [{ id: "interview-1", companyName: "公司", roleName: "岗位", roundLabel: "一面" }], experiences: [{ id: "experience-1", name: "项目 A" }], faqCategories: ["协作沟通"] };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  commit.mockResolvedValue({ error: null, success: "已保存。" });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(overrides: Partial<Parameters<typeof FaqEntryForm>[0]> = {}) { await act(async () => root.render(createElement(FaqEntryForm, { ...props, ...overrides }))); }
const groups = () => Array.from(container.querySelectorAll<HTMLElement>(".faq-entry-group"));
const cards = (index = 0) => Array.from(groups()[index].querySelectorAll<HTMLElement>(".faq-entry-card"));
const source = (index = 0) => groups()[index].querySelector<HTMLSelectElement>("select[name=interviewId]")!;
const binding = (index = 0) => groups()[index].querySelectorAll<HTMLSelectElement>("select")[1];
const question = (group = 0, card = 0) => cards(group)[card].querySelector("textarea")!;
const invalid = () => Array.from(container.querySelectorAll('[aria-invalid="true"], [data-invalid="true"]'));
const payload = () => JSON.parse(container.querySelector<HTMLInputElement>('input[name="groupsJson"]')!.value);
async function click(text: string, scope: ParentNode = container) { const button = Array.from(scope.querySelectorAll("button")).find((item) => item.textContent === text || item.getAttribute("aria-label") === text); expect(button, text).toBeDefined(); await act(async () => button!.click()); }
async function fill(element: HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(async () => { const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
async function ready() { await fill(source(), "none"); await fill(binding(), "unbound"); await fill(question(), "第一个问题"); }

describe("grouped FAQ entry", () => {
  it("validates source, binding and question in visual order", async () => {
    await render(); expect(groups()).toHaveLength(1); expect(cards()).toHaveLength(1); expect(invalid()).toEqual([]);
    await click("保存全部 1 条 FAQ"); expect(invalid()).toEqual([source(), binding(), question()]); expect(document.activeElement).toBe(source()); expect(commit).not.toHaveBeenCalled();
  });
  it("appends in place, inherits group settings and keeps other groups independent", async () => {
    await render(); await ready(); await click("追加 FAQ");
    expect(document.activeElement).toBe(question(0, 1)); await fill(question(0, 1), "第二个问题");
    await fill(binding(), "bound"); await fill(groups()[0].querySelectorAll("select")[2], "experience-1");
    await click("添加一组"); expect(document.activeElement).toBe(source(1)); expect(source(1).value).toBe("");
    await fill(source(1), "interview-1"); await fill(binding(1), "unbound"); await fill(question(1), "另一场面试的问题");
    await click("保存全部 3 条 FAQ"); await click("直接保存");
    const submitted = JSON.parse((commit.mock.calls[0][1] as FormData).get("groupsJson") as string);
    expect(submitted).toEqual([
      expect.objectContaining({ interviewId: "none", binding: "bound", experienceId: "experience-1", category: null, items: [{ question: "第一个问题", answer: "" }, { question: "第二个问题", answer: "" }] }),
      expect.objectContaining({ interviewId: "interview-1", binding: "unbound", experienceId: null, items: [{ question: "另一场面试的问题", answer: "" }] }),
    ]);
  });
  it("clears incompatible settings on binding changes", async () => {
    await render(); await ready(); await fill(groups()[0].querySelectorAll("select")[2], "协作沟通");
    await fill(binding(), "bound"); await fill(groups()[0].querySelectorAll("select")[2], "experience-1");
    expect(payload()[0]).toMatchObject({ category: null, experienceId: "experience-1" });
    await fill(binding(), "unbound"); expect(payload()[0]).toMatchObject({ category: null, experienceId: null });
  });
  it("pastes into the current group without replacing edited cards and skips malformed questions", async () => {
    await render(); await ready(); await click("批量粘贴");
    await fill(groups()[0].querySelector<HTMLTextAreaElement>(".faq-paste-panel textarea")!, "Q:\nA: 无问题\n---\nQ: 粘贴问题一\nA: 答案\n\nQ: 粘贴问题二");
    expect(container.textContent).toContain("1 条缺少问题，将跳过"); await click("添加 2 条");
    expect(cards()).toHaveLength(3); expect(question().value).toBe("第一个问题"); expect(question(0, 2).value).toBe("粘贴问题二"); expect(document.activeElement).toBe(question(0, 1));
    expect(payload()[0].items[1]).toEqual({ question: "粘贴问题一", answer: "答案" });
  });
  it("retains collapsed paste text and blocks unadded content", async () => {
    await render(); await ready(); await click("批量粘贴"); await fill(groups()[0].querySelector<HTMLTextAreaElement>(".faq-paste-panel textarea")!, "Q: 尚未添加");
    await click("收起粘贴"); await click("保存全部 1 条 FAQ"); expect(container.querySelector("dialog")).toBeNull();
    expect(groups()[0].querySelector<HTMLTextAreaElement>(".faq-paste-panel textarea")?.value).toBe("Q: 尚未添加");
  });
  it("confirms removal of filled cards and groups", async () => {
    await render(); await ready(); await click("添加一组"); await click("移除第 1 组 FAQ 1"); await click("取消"); expect(question().value).toBe("第一个问题");
    await click("移除第 1 组"); await click("确认移除"); expect(groups()).toHaveLength(1); expect(question().value).toBe("");
  });
  it("excludes deselected groups without requiring their settings", async () => {
    await render(); await ready(); await click("添加一组"); await act(async () => groups()[1].querySelector<HTMLInputElement>('.faq-select-all input')!.click());
    await click("保存全部 1 条 FAQ"); await click("直接保存"); expect(JSON.parse((commit.mock.calls[0][1] as FormData).get("groupsJson") as string)).toHaveLength(1);
  });
  it("allows empty answers and an explicit no-source choice without interviews", async () => {
    await render({ interviews: [] }); await ready(); await click("保存全部 1 条 FAQ"); await click("直接保存"); expect(commit).toHaveBeenCalledTimes(1);
  });
  it("restores boundaries and explicit null sources independently from legacy defaults", async () => {
    await render({ initialDraft: { batchId: "batch-1", sourceInterviewId: "interview-1", items: [
      { groupId: "a", sourceInterviewId: null, question: "无来源", answer: "", binding: "unbound", category: null, experienceId: null },
      { groupId: "b", sourceInterviewId: "interview-1", question: "面试题", answer: "", binding: "bound", category: null, experienceId: "experience-1" },
    ] } });
    expect(groups()).toHaveLength(2); expect(source().value).toBe("none"); expect(source(1).value).toBe("interview-1"); expect(binding(1).value).toBe("bound");
  });
  it("requires reselecting deleted interviews and experiences", async () => {
    await render({ initialDraft: { batchId: "batch-1", sourceInterviewId: "removed", items: [{ question: "恢复问题", answer: "", binding: "bound", category: null, experienceId: "removed" }] } });
    await click("保存全部 1 条 FAQ"); expect(invalid()).toEqual([source(), groups()[0].querySelectorAll("select")[2]]);
  });
  it("retains failed submissions and prevents duplicate saves", async () => {
    const saving = Promise.withResolvers<{ error: string; success: null }>(); commit.mockReturnValueOnce(saving.promise);
    await render(); await ready(); await click("保存全部 1 条 FAQ"); await click("直接保存"); await click("保存中…"); expect(commit).toHaveBeenCalledTimes(1);
    await act(async () => saving.resolve({ error: "保存失败", success: null })); expect(question().value).toBe("第一个问题"); expect(container.textContent).toContain("保存失败");
  });
  it("caps manual and pasted entry at 100 cards", async () => {
    await render({ initialDraft: { batchId: "batch", sourceInterviewId: null, items: Array.from({ length: 100 }, (_, i) => ({ question: `题 ${i}`, answer: "", binding: "unbound", category: null, experienceId: null })) } });
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "添加一组")?.disabled).toBe(true);
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "追加 FAQ")?.disabled).toBe(true);
  });
});
