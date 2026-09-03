"use client";

import { Activity, useCallback, useState } from "react";
import Link from "next/link";
import { OperationModal } from "@/components/operation-modal";
import { FaqBatchForm, type FaqImportEditDraft } from "./knowledge-forms";
import { FaqImportProgress } from "./import-progress";

export function FaqImportRecovery({ draft, experiences, interviews, faqCategories }: {
  draft: FaqImportEditDraft;
  experiences: Array<{ id: string; name: string }>;
  interviews: Array<{ id: string; companyName: string; roleName: string; roundLabel: string }>;
  faqCategories: string[];
}) {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const closeEditor = useCallback(() => setEditorOpen(false), []);
  const handleImported = useCallback(() => setCompleted(true), []);

  function returnToEdit() {
    setEditKey(globalThis.crypto.randomUUID());
    setEditorOpen(true);
  }

  if (completed) return null;
  if (!editKey) return <FaqImportProgress batchId={draft.batchId} onImported={handleImported} onReturnToEdit={returnToEdit} />;
  return <>
    <section className="surface-card form-panel create-form">
      <div className="form-heading">
        <h2>待导入 FAQ</h2>
        <p>尚未导入，可继续编辑后确认。</p>
      </div>
      <div className="modal-footer-actions">
        <Link className="secondary-button" href="/faq">返回知识库</Link>
        <button className="primary-button" onClick={() => setEditorOpen(true)} type="button">继续编辑</button>
      </div>
    </section>
    {/* Hide the editor without discarding unsaved form values; release modal effects while closed. */}
    <Activity mode={editorOpen ? "visible" : "hidden"}>
      <OperationModal title="编辑待导入 FAQ" onClose={closeEditor}>
        <FaqBatchForm initialDraft={draft} token={editKey} experiences={experiences} interviews={interviews} faqCategories={faqCategories}
          onSuccess={handleImported} />
      </OperationModal>
    </Activity>
  </>;
}
