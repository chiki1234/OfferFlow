// @vitest-environment jsdom
import { act, createElement, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationModal } from "../src/components/operation-modal";

let container: HTMLDivElement;
let root: Root;

function modal(props: ComponentProps<typeof OperationModal> & { key?: string }) {
  return createElement(OperationModal, props);
}

function Card() {
  const [open, setOpen] = useState(false);
  return createElement("article", { style: { transform: "translateY(-2px)", overflow: "hidden" } },
    createElement("button", { onClick: () => setOpen(true) }, "编辑"),
    open && modal({
      title: "编辑岗位", onClose: () => setOpen(false),
      children: createElement("input", { "aria-label": "岗位" }),
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

describe("OperationModal from a transformed card", () => {
  it("keeps the parent open and scroll locked when Escape closes a nested editor", async () => {
    const outerClose = vi.fn();
    function Nested() {
      const [inner, setInner] = useState(false);
      return modal({ title: "岗位详情", onClose: outerClose, children: [
        createElement("button", { key: "trigger", onClick: () => setInner(true) }, "编辑岗位"),
        inner && modal({ key: "inner", title: "编辑岗位", onClose: () => setInner(false), children: createElement("input") }),
      ] });
    }
    await act(async () => root.render(createElement(Nested)));
    const trigger = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "编辑岗位")!;
    trigger.focus();
    await act(async () => trigger.click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(outerClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(trigger);
  });

  it("escapes the card's containing block and restores focus and scrolling on close", async () => {
    document.body.style.overflow = "auto";
    await act(async () => root.render(createElement(Card)));
    const trigger = container.querySelector("button")!;
    trigger.focus();
    await act(async () => trigger.click());
    const backdrop = document.querySelector(".modal-backdrop")!;
    expect(backdrop.parentElement).toBe(document.body);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(document.querySelector('input[aria-label="岗位"]'));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
  });

  it("renders safely on the server without a portal", () => {
    expect(renderToString(modal({
      title: "编辑岗位", onClose: () => {}, children: "岗位信息",
    }))).toBe("");
  });
});
