"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function FaqAnswerDisclosure({ answer, question }: { answer: string; question: string }) {
  const [open, setOpen] = useState(false);
  const answerId = useId();

  return <>
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
  </>;
}
