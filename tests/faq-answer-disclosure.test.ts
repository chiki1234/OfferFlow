// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaqAnswerDisclosure } from "../src/app/faq/faq-answer-disclosure";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderCard(footer = createElement("footer", null, "来源说明")) {
  await act(async () => root.render(createElement(
    FaqAnswerDisclosure,
    { answer: "示例答案", footer, question: "示例问题" },
    createElement("h3", null, "示例问题"),
  )));
}

describe("FAQ answer disclosure", () => {
  it("toggles the answer from ordinary card content", async () => {
    await renderCard();
    expect(container.querySelector(".faq-card-answer")).toBeNull();

    await act(async () => container.querySelector("h3")!.click());
    expect(container.querySelector(".faq-card-answer")?.textContent).toBe("示例答案");

    await act(async () => container.querySelector<HTMLElement>(".faq-card-answer")!.click());
    expect(container.querySelector(".faq-card-answer")).toBeNull();
  });

  it("keeps the dedicated toggle as a single accessible action", async () => {
    await renderCard();
    const toggle = container.querySelector<HTMLButtonElement>(".faq-answer-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".faq-card-answer")).not.toBeNull();
  });

  it("does not toggle from links or marked action regions", async () => {
    const action = vi.fn();
    await renderCard(createElement("footer", null,
      createElement("a", { href: "/interviews/1", onClick: (event) => event.preventDefault() }, "来源面试"),
      createElement("div", { "data-faq-card-action": true },
        createElement("span", { onClick: action }, "编辑区域空白"),
      ),
    ));

    await act(async () => container.querySelector("a")!.click());
    expect(container.querySelector(".faq-card-answer")).toBeNull();

    await act(async () => container.querySelector<HTMLElement>("[data-faq-card-action] span")!.click());
    expect(action).toHaveBeenCalledOnce();
    expect(container.querySelector(".faq-card-answer")).toBeNull();
  });

  it("does not toggle while the user is selecting card text", async () => {
    await renderCard();
    const question = container.querySelector("h3")!;
    const range = document.createRange();
    range.selectNodeContents(question);
    window.getSelection()!.addRange(range);

    await act(async () => question.click());
    expect(container.querySelector(".faq-card-answer")).toBeNull();
  });
});
