"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const modalStack: symbol[] = [];
let originalBodyOverflow = "";

export function OperationModal({
  title,
  description,
  children,
  onClose,
  size = "standard",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: "standard" | "wide";
}) {
  const isClient = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isClient) return;
    const modalId = Symbol("modal");
    if (!modalStack.length) originalBodyOverflow = document.body.style.overflow;
    modalStack.push(modalId);
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== modalId) return;
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']",
        ) ?? [],
      ).filter((element) => !element.closest("[hidden]"));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        panelRef.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>(
        "input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      ) ?? panelRef.current?.querySelector<HTMLElement>("button");
    focusTarget?.focus();
    return () => {
      const index = modalStack.indexOf(modalId);
      const wasTop = modalStack.at(-1) === modalId;
      if (index >= 0) modalStack.splice(index, 1);
      if (!modalStack.length) document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (wasTop && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isClient]);

  if (!isClient) return null;

  // Keep fixed positioning independent of transformed or clipped trigger cards.
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-modal="true"
        aria-labelledby={titleId}
        className={size === "wide" ? "operation-modal operation-modal-wide" : "operation-modal"}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            aria-label="关闭弹窗"
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
