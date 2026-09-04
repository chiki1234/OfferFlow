// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaqImportProgress } from "../src/app/faq/import-progress";
import { FaqCreateButton } from "../src/app/faq/knowledge-actions";
import { FaqImportRecovery } from "../src/app/faq/import-recovery";

const { router, confirmImport, retryAnalysis, beginAnalysis, importEdited } = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  confirmImport: vi.fn(),
  retryAnalysis: vi.fn(),
  beginAnalysis: vi.fn(),
  importEdited: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../src/app/faq/import-actions", () => ({
  beginFaqAnalysis: beginAnalysis,
  importEditedFaqBatch: importEdited,
  confirmFaqImport: confirmImport,
  retryFaqAnalysis: retryAnalysis,
}));
vi.mock("../src/app/faq/actions", () => ({
  commitFaqBatchAction: vi.fn(), createExperienceAction: vi.fn(), createFaqCategoryAction: vi.fn(),
  deleteFaqAction: vi.fn(), deleteFaqCategoryAction: vi.fn(), renameFaqCategoryAction: vi.fn(),
  setResumeExperiencesAction: vi.fn(), updateExperienceAction: vi.fn(), updateFaqAction: vi.fn(),
  deleteExperienceAction: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;
let serverStatus: string;
let fetchMock: ReturnType<typeof vi.fn>;
const interviewOptions = [{ id: "interview-1", companyName: "公司", roleName: "岗位", roundLabel: "一面" }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  beginAnalysis.mockResolvedValue({ batchId: "batch-1", error: null });
  importEdited.mockResolvedValue({ result: { faqIds: ["faq-1"], importedCount: 1, mergedCount: 0 }, error: null });
  serverStatus = "pending";
  fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      serverStatus = "failed";
      return { ok: true };
    }
    return { ok: true, json: async () => ({
      status: serverStatus,
      error: serverStatus === "failed" ? "AI 暂时不可用" : null,
      completedCount: 0,
      totalCount: 1,
    }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  confirmImport.mockImplementation(async () => {
    serverStatus = "completed";
    return { result: { faqIds: ["faq-1"], importedCount: 1, mergedCount: 0 }, error: null };
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function analyzeUntilFailure(onImported?: () => void) {
  await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1", onImported })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(container.textContent).toContain("这次分析未能完成");
}

function skipAiButton() {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("跳过 AI"));
  expect(button).toBeDefined();
  return button!;
}

async function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
}

async function fillTextArea(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function startFromKnowledgePage() {
  await act(async () => { root.render(createElement(FaqCreateButton, { interviews: interviewOptions, experiences: [], faqCategories: [] })); });
  await clickButton("新增 FAQ");
  const interview = container.querySelector<HTMLSelectElement>("select[name=interviewId]")!;
  await act(async () => { interview.value = "interview-1"; interview.dispatchEvent(new Event("change", { bubbles: true })); });
  await fillTextArea(container.querySelector("textarea")!, "测试失败后跳过 AI");
  await fillTextArea(container.querySelectorAll("textarea")[1], "测试答案");
  const binding = container.querySelector<HTMLSelectElement>(".faq-group-fields > label:not(.faq-group-source) select")!;
  await act(async () => { binding.value = "unbound"; binding.dispatchEvent(new Event("change", { bubbles: true })); });
  await clickButton("保存全部 1 条 FAQ");
  expect(container.querySelector("dialog h2")?.textContent).toBe("检查相似 FAQ？");
  await clickButton("使用 AI 分析");
}

describe("FAQ import failure fallback", () => {
  it("stops after three failed connection retries and offers all recovery actions", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const onReturnToEdit = vi.fn();
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1", onReturnToEdit })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("这次分析未能完成");
    expect(container.textContent).toContain("已重试 3 次");
    expect(skipAiButton().disabled).toBe(false);
    const edit = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "返回编辑");
    expect(edit).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await act(async () => { edit!.click(); });
    expect(onReturnToEdit).toHaveBeenCalledTimes(1);
  });

  it("counts failed starts even when each status request succeeds", async () => {
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") throw new Error("cannot start");
      return { ok: true, json: async () => ({ status: "pending", error: null, completedCount: 0, totalCount: 1 }) };
    });
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(4);
    expect(container.textContent).toContain("这次分析未能完成");
  });

  it("times out a stalled status request and eventually releases the analysis screen", async () => {
    fetchMock.mockImplementation((_url: string, options?: RequestInit) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    }));
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("这次分析未能完成");
    expect(skipAiButton().disabled).toBe(false);
  });

  it("resets consecutive failures after a successful poll", async () => {
    serverStatus = "analyzing";
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(container.textContent).not.toContain("正在重试");
    fetchMock.mockRejectedValue(new Error("offline again"));
    await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
    expect(container.textContent).toContain("AI 分析中");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(container.textContent).toContain("这次分析未能完成");
  });

  it("does not start analysis from a status response arriving after its timeout", async () => {
    serverStatus = "analyzing";
    const late = Promise.withResolvers<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock.mockImplementationOnce(() => late.promise);
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(12500); });
    await act(async () => { late.resolve({ ok: true, json: async () => ({ status: "pending", error: null, completedCount: 0, totalCount: 1 }) }); });
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });

  it("allows manual retry or direct import after exhausting connection retries", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
    retryAnalysis.mockResolvedValueOnce({ error: null });
    await clickButton("重新分析");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(container.textContent).toContain("AI 分析中");
    await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    await act(async () => { skipAiButton().click(); });
    expect(confirmImport).toHaveBeenCalledTimes(1);
    expect(container.querySelector("dialog[open]")).toBeNull();
  });

  it("releases recovery buttons when a manual retry request never returns", async () => {
    const onReturnToEdit = vi.fn();
    serverStatus = "failed";
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1", onReturnToEdit })); });
    retryAnalysis.mockImplementationOnce(() => new Promise(() => {}));
    await clickButton("重新分析");
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(container.textContent).toContain("暂时无法重新分析");
    expect(skipAiButton().disabled).toBe(false);
    await clickButton("返回编辑");
    expect(onReturnToEdit).toHaveBeenCalledTimes(1);
    expect(container.querySelector("dialog[open]")).toBeNull();
  });

  it("returns to the original editable draft even while offline and submits the edited batch directly", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await startFromKnowledgePage();
    await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
    await clickButton("返回编辑");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(container.querySelector("textarea")?.value).toBe("测试失败后跳过 AI");
    expect(container.querySelector<HTMLSelectElement>(".faq-group-fields > label:not(.faq-group-source) select")?.value).toBe("unbound");
    await fillTextArea(container.querySelector<HTMLTextAreaElement>(".faq-entry-card textarea")!, "修改后的问题");
    await clickButton("保存全部 1 条 FAQ");
    await clickButton("直接保存");
    const submitted = importEdited.mock.calls[0][0] as FormData;
    expect(submitted.get("replaceBatchId")).toBe("batch-1");
    expect(submitted.get("idempotencyKey")).not.toBe("test-import-token");
    expect(JSON.parse(String(submitted.get("groupsJson")))[0].items[0]).toMatchObject({ question: "修改后的问题", answer: "测试答案" });
    expect(container.querySelector("dialog[open], [role=dialog]")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reanalyzes edited content with a fresh submission key", async () => {
    await startFromKnowledgePage();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await clickButton("返回编辑");
    await fillTextArea(container.querySelector<HTMLTextAreaElement>(".faq-entry-card textarea")!, "重新分析这个问题");
    await clickButton("保存全部 1 条 FAQ");
    await clickButton("使用 AI 分析");
    const submitted = beginAnalysis.mock.calls[1][0] as FormData;
    expect(submitted.get("replaceBatchId")).toBe("batch-1");
    expect(submitted.get("idempotencyKey")).not.toBe("test-import-token");
    expect(JSON.parse(String(submitted.get("groupsJson")))[0].items[0].question).toBe("重新分析这个问题");
  });

  it("reuses the edited submission key for retries but changes it after another edit", async () => {
    await startFromKnowledgePage();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await clickButton("返回编辑");
    importEdited.mockResolvedValueOnce({ result: null, error: "暂时无法导入" }).mockResolvedValueOnce({ result: null, error: "暂时无法导入" });
    await clickButton("保存全部 1 条 FAQ");
    await clickButton("直接保存");
    await clickButton("直接保存");
    await clickButton("返回编辑");
    await fillTextArea(container.querySelector<HTMLTextAreaElement>(".faq-entry-card textarea")!, "再次修改问题");
    await clickButton("保存全部 1 条 FAQ");
    await clickButton("直接保存");
    const keys = importEdited.mock.calls.map((args) => (args[0] as FormData).get("idempotencyKey"));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it.each(["close button", "Escape", "backdrop"])("restores the recovery draft in a modal and preserves edits after closing with %s", async (closeWith) => {
    serverStatus = "failed";
    await act(async () => { root.render(createElement(FaqImportRecovery, {
      draft: { batchId: "batch-1", sourceInterviewId: "interview-1", items: [{ question: "恢复问题", answer: "恢复答案", binding: "bound", experienceId: "experience-1", category: null }] },
      experiences: [{ id: "experience-1", name: "项目经历" }],
      interviews: [{ id: "interview-1", companyName: "公司", roleName: "岗位", roundLabel: "一面" }], faqCategories: [],
    })); });
    await clickButton("返回编辑");
    expect(container.querySelector("dialog[open]")).toBeNull();
    const modal = container.querySelector<HTMLElement>(".modal-backdrop [role=dialog][aria-modal=true]");
    expect(modal).not.toBeNull();
    expect(modal!.querySelector("h2")?.textContent).toBe("编辑待导入 FAQ");
    expect(modal!.contains(container.querySelector(".faq-import-form"))).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const questions = modal!.querySelectorAll<HTMLTextAreaElement>(".faq-entry-card textarea");
    expect(questions[0].value).toBe("恢复问题");
    expect(questions[1].value).toBe("恢复答案");
    expect(container.querySelector<HTMLSelectElement>("select[name=interviewId]")?.value).toBe("interview-1");
    expect(Array.from(container.querySelectorAll<HTMLSelectElement>(".faq-group-fields > label:not(.faq-group-source) select")).map((select) => select.value)).toEqual(["bound", "experience-1"]);
    await fillTextArea(questions[0], "关闭后保留的问题");
    await fillTextArea(questions[1], "关闭后保留的答案");
    const interview = modal!.querySelector<HTMLSelectElement>("select[name=interviewId]")!;
    await act(async () => { interview.value = ""; interview.dispatchEvent(new Event("change", { bubbles: true })); });
    const requestsBeforeClose = fetchMock.mock.calls.length;
    await act(async () => {
      if (closeWith === "close button") modal!.querySelector<HTMLButtonElement>("button[aria-label='关闭弹窗']")!.click();
      else if (closeWith === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else container.querySelector(".modal-backdrop")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector<HTMLElement>(".modal-backdrop")?.style.display).toBe("none");
    expect(document.body.style.overflow).toBe("");
    expect(container.querySelector("dialog[open]")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    await clickButton("继续编辑");
    expect(container.querySelector<HTMLElement>(".modal-backdrop")?.style.display).not.toBe("none");
    expect(document.body.style.overflow).toBe("hidden");
    expect(container.querySelector<HTMLTextAreaElement>(".faq-entry-card textarea")?.value).toBe("关闭后保留的问题");
    expect(container.querySelector<HTMLSelectElement>("select[name=interviewId]")?.value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeClose);
    expect(router.replace).not.toHaveBeenCalled();
    await clickButton("保存全部 1 条 FAQ");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(interview.getAttribute("aria-invalid")).toBe("true");
    await act(async () => { interview.value = "interview-1"; interview.dispatchEvent(new Event("change", { bubbles: true })); });
    await clickButton("保存全部 1 条 FAQ");
    await clickButton("直接保存");
    const submitted = importEdited.mock.calls[0][0] as FormData;
    expect(submitted.get("replaceBatchId")).toBe("batch-1");
    expect(submitted.get("interviewId")).toBe("interview-1");
    expect(JSON.parse(String(submitted.get("groupsJson")))[0].items[0]).toMatchObject({ question: "关闭后保留的问题", answer: "关闭后保留的答案" });
    expect(beginAnalysis).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open], [role=dialog]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(router.replace).toHaveBeenLastCalledWith("/faq?imported=1&merged=0");
  });

  it("closes both dialogs after importing from the knowledge page and starts a fresh form next time", async () => {
    await act(async () => { root.render(createElement(FaqCreateButton, { interviews: interviewOptions, experiences: [], faqCategories: [] })); });
    const clickButton = async (text: string) => {
      const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
      expect(button).toBeDefined();
      await act(async () => { button!.click(); });
    };
    await clickButton("新增 FAQ");
    const interview = container.querySelector<HTMLSelectElement>("select[name=interviewId]")!;
    await act(async () => { interview.value = "interview-1"; interview.dispatchEvent(new Event("change", { bubbles: true })); });
    const blocks = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(blocks, "测试失败后跳过 AI");
      blocks.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const binding = container.querySelector<HTMLSelectElement>(".faq-group-fields > label:not(.faq-group-source) select")!;
    await act(async () => {
      binding.value = "unbound";
      binding.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clickButton("保存全部 1 条 FAQ");
    expect(container.querySelector("dialog h2")?.textContent).toBe("检查相似 FAQ？");
    await clickButton("使用 AI 分析");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(container.textContent).toContain("这次分析未能完成");
    await act(async () => { skipAiButton().click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(container.querySelector("dialog[open], [role=dialog]")).toBeNull();
    expect(router.replace).toHaveBeenLastCalledWith("/faq?imported=1&merged=0");
    await clickButton("新增 FAQ");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(container.querySelector("dialog[open]")).toBeNull();
  });

  it("closes the analysis dialog after skipping AI even when navigation preserves the component", async () => {
    const onImported = vi.fn();
    await analyzeUntilFailure(onImported);
    await act(async () => { skipAiButton().click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(confirmImport).toHaveBeenCalledWith("batch-1", { newItemIds: [], merges: [] }, true);
    expect(retryAnalysis).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(container.textContent).not.toContain("AI 分析中");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(router.replace).toHaveBeenLastCalledWith("/faq?imported=1&merged=0");
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("ignores an old poll while saving and never restarts analysis from that response", async () => {
    await analyzeUntilFailure();
    const oldPoll = Promise.withResolvers<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock.mockImplementationOnce(() => oldPoll.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    const saving = Promise.withResolvers<unknown>();
    confirmImport.mockImplementationOnce(() => saving.promise);
    await act(async () => { skipAiButton().click(); });
    await act(async () => {
      oldPoll.resolve({ ok: true, json: async () => ({ status: "pending", error: null, completedCount: 0, totalCount: 1 }) });
    });
    const whileSaving = container.textContent;
    const analysisStarts = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST").length;
    await act(async () => {
      saving.resolve({ result: { faqIds: ["faq-1"], importedCount: 1, mergedCount: 0 }, error: null });
    });
    const requestsAfterSave = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(whileSaving).toContain("正在导入 FAQ");
    expect(whileSaving).not.toContain("AI 分析中");
    expect(analysisStarts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(requestsAfterSave);
    expect(container.querySelector("dialog[open]")).toBeNull();
  });

  it("keeps the fallback available when saving fails without triggering AI", async () => {
    await analyzeUntilFailure();
    confirmImport.mockResolvedValueOnce({ result: null, error: "保存失败，请重试" });
    await act(async () => { skipAiButton().click(); });
    expect(container.textContent).toContain("保存失败，请重试");
    expect(skipAiButton().disabled).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    expect(retryAnalysis).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("dismisses a completed batch received by polling instead of presenting it as analyzing", async () => {
    const onImported = vi.fn();
    serverStatus = "analyzing";
    await act(async () => { root.render(createElement(FaqImportProgress, { batchId: "batch-1", onImported })); });
    serverStatus = "completed";
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith("/faq");
  });

  it("only starts analysis again when the user chooses retry", async () => {
    await analyzeUntilFailure();
    retryAnalysis.mockImplementationOnce(async () => { serverStatus = "pending"; return { error: null }; });
    const retry = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "重新分析")!;
    await act(async () => { retry.click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(retryAnalysis).toHaveBeenCalledWith("batch-1");
    expect(confirmImport).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2);
  });
});
