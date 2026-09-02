"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function OperationModal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const focusTarget = panelRef.current?.querySelector<HTMLElement>("input:not([type='hidden']), select, textarea, button");
    focusTarget?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-modal="true" className="operation-modal" ref={panelRef} role="dialog">
        <header className="modal-heading">
          <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
          <button aria-label="关闭弹窗" className="modal-close" onClick={onClose} type="button"><X size={19} /></button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
