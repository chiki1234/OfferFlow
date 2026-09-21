// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobsSearch } from "@/app/jobs/jobs-search";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  router.replace.mockReset();
});

async function render() {
  await act(async () => root.render(createElement(JobsSearch, { query: "", tab: "planned", counts: { planned: 1, active: 2, ended: 3 } })));
}
async function input(value: string, event = "input") {
  const field = container.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event(event, { bubbles: true }));
  });
  return field;
}

describe("岗位搜索", () => {
  it("中文输入法组合期间不搜索，组合结束后只提交最终词", async () => {
    await render();
    const field = container.querySelector<HTMLInputElement>("input")!;
    await act(async () => field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    await input("zhong");
    await act(async () => vi.advanceTimersByTime(300));
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(200));
    expect(router.replace).toHaveBeenCalledWith("/jobs?tab=planned&q=zhong", { scroll: false });
  });

  it("切换标签使用当前草稿并取消原标签的延迟搜索", async () => {
    await render();
    await input("腾讯");
    const active = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find(link => link.textContent?.includes("进行中"))!;
    expect(active.getAttribute("href")).toBe("/jobs?tab=active&q=%E8%85%BE%E8%AE%AF");
    await act(async () => active.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    await act(async () => vi.advanceTimersByTime(200));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
