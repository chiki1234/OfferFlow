"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { quickImportJobTracksAction, type CreateJobTrackFormState } from "./actions";

const initialState: CreateJobTrackFormState = { error: null, success: null };

export function QuickImportForm({ idempotencyKey, onSuccess }: { idempotencyKey: string; onSuccess?: () => void }) {
  const [state, action] = useActionState(quickImportJobTracksAction, initialState);
  useEffect(() => { if (state.success) onSuccess?.(); }, [onSuccess, state.success]);
  return <form action={action} className="create-form"><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><label>统一创建为<select name="lifecycle"><option value="planned">待投递</option><option value="active">已投递 / 进行中</option></select></label><label>每行一个岗位<textarea name="raw" rows={8} placeholder={"华为｜AI解决方案工程师\n腾讯｜AI产品经理"} required /></label><p className="form-hint">每行使用“公司｜岗位”格式，最多一次导入 100 个岗位。</p>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<Submit /></form>;
}

function Submit() { const { pending } = useFormStatus(); return <button className="primary-button wide" disabled={pending} type="submit">{pending ? "导入中…" : "批量创建"}</button>; }
