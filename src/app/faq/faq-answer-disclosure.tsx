"use client";

import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const CARD_ACTION_SELECTOR =
  "a, button, input, select, textarea, summary, [role='button'], [role='link'], [data-faq-card-action]";

export function FaqAnswerDisclosure({
  answer,
  children,
  footer,
  question,
}: {
  answer: string;
  children?: ReactNode;
  footer: ReactNode;
  question: string;
}) {
  const [open, setOpen] = useState(false);
  const answerId = useId();

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest(CARD_ACTION_SELECTOR)
    ) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    setOpen((current) => !current);
  }

  return <article className="surface-card faq-card" data-open={open} onClick={handleCardClick}>
    {children}
    <button
      aria-controls={answerId}
      aria-expanded={open}
      aria-label={`${open ? "折叠" : "展开"}“${question}”的答案`}
      className={open ? "faq-answer-toggle open" : "faq-answer-toggle"}
      onClick={() => setOpen((current) => !current)}
      title={open ? "折叠答案" : "展开答案"}
      type="button"
    >
      <ChevronDown size={18} />
    </button>
    {open && <p className="faq-card-answer" id={answerId}>{answer || "暂未记录答案"}</p>}
    {footer}
  </article>;
}
