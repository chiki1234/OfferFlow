"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BookOpen, BriefcaseBusiness, ClipboardPlus, Layers3, ListPlus, Plus, Send } from "lucide-react";
import { FaqEntryForm } from "@/app/faq/faq-entry-form";
import { ExperienceForm } from "@/app/faq/knowledge-forms";
import { CreateJobForm } from "@/app/jobs/create-job-form";
import { loadGlobalQuickOptionsAction } from "@/app/quick/actions";
import { QuickProgressForm, QuickTaskForm } from "@/app/quick/quick-forms";
import { OperationModal } from "@/components/operation-modal";

type QuickKind = "planned" | "active" | "progress" | "task" | "faq" | "experience";
type QuickOptions = Awaited<ReturnType<typeof loadGlobalQuickOptionsAction>>;

const quickActions = [
  { kind: "planned" as const, label: "新增待投递岗位", icon: BriefcaseBusiness },
  { kind: "active" as const, label: "新增已投递岗位", icon: Send },
  { kind: "progress" as const, label: "记录进展", icon: ClipboardPlus },
  { kind: "task" as const, label: "新增待办", icon: ListPlus },
  { kind: "faq" as const, label: "新增 FAQ", icon: BookOpen },
  { kind: "experience" as const, label: "新增经历", icon: Layers3 },
];

export function GlobalQuickActions() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<QuickKind | null>(null);
  const [options, setOptions] = useState<QuickOptions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [token, setToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeModal = useCallback(() => {
    setActiveKind(null);
    setOptions(null);
  }, []);

  function openAction(kind: QuickKind) {
    setMenuOpen(false);
    setActiveKind(kind);
    setToken(globalThis.crypto.randomUUID());
    setLoadError(false);
    if (!options && kind !== "experience") {
      startTransition(async () => {
        try {
          setOptions(await loadGlobalQuickOptionsAction());
        } catch {
          setLoadError(true);
        }
      });
    }
  }

  const title = quickActions.find((item) => item.kind === activeKind)?.label ?? "快捷操作";

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <div className={menuOpen ? "floating-action-wrap open" : "floating-action-wrap"} ref={menuRef}>
        {menuOpen && <div className="floating-action-menu">{quickActions.map(({ kind, label, icon: Icon }) => <button key={kind} onClick={() => openAction(kind)} type="button"><Icon size={17} /><span>{label}</span></button>)}</div>}
        <button aria-expanded={menuOpen} aria-label={menuOpen ? "关闭全局快捷操作" : "打开全局快捷操作"} className="floating-add" onClick={() => setMenuOpen((current) => !current)} type="button"><Plus size={24} /></button>
      </div>
      {activeKind && <OperationModal onClose={closeModal} title={title}>
        {activeKind === "experience" ? <ExperienceForm onSuccess={closeModal} /> : isPending && !options ? <p className="modal-loading">正在准备操作表单…</p> : loadError ? <div className="modal-error"><p>操作选项加载失败，请重试。</p><button className="secondary-button" onClick={() => openAction(activeKind)} type="button">重新加载</button></div> : options ? (
          activeKind === "planned" || activeKind === "active"
            ? <CreateJobForm experiences={options.experiences} fixedCreationMode={activeKind} idempotencyKey={token} onSuccess={closeModal} resumes={options.resumes} />
            : activeKind === "progress"
              ? <QuickProgressForm currentLocal={toShanghaiLocalInput(new Date())} embedded jobs={options.jobs} onSuccess={closeModal} token={token} />
              : activeKind === "task"
                ? <QuickTaskForm embedded interviews={options.interviews} jobs={options.jobs} onSuccess={closeModal} token={token} unboundTasks={[]} />
                : <FaqEntryForm experiences={options.experiences} faqCategories={options.faqCategories} interviews={options.interviews} onSuccess={closeModal} token={token} />
        ) : null}
      </OperationModal>}
    </>
  );
}

function toShanghaiLocalInput(value: Date) {
  return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
