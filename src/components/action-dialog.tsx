"use client";

import { useState } from "react";
import { OperationModal } from "./operation-modal";

export function ActionDialog({ label, title = label, children, className = "secondary-button" }: { label: string; title?: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>{open && <OperationModal title={title} onClose={() => setOpen(false)}>{children}</OperationModal>}</>;
}
