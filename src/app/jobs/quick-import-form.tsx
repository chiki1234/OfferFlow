"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { quickImportJobTracksAction, type CreateJobTrackFormState } from "./actions";

const initialState: CreateJobTrackFormState = { error: null };

export function QuickImportForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action] = useActionState(quickImportJobTracksAction, initialState);
  return <details className="quick-import"><summary>已有很多历史岗位？使用极速建档</summary><form action={action} className="create-form"><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><label>统一创建为<select name="lifecycle"><option value="planned">待投递</option><option value="active">已投递 / 进行中</option></select></label><label>每行一个岗位<textarea name="raw" rows={6} placeholder={"华为｜AI解决方案工程师\n腾讯｜AI产品经理"} required /></label>{state.error && <p className="form-error">{state.error}</p>}<Submit /></form></details>;
}

function Submit() { const { pending } = useFormStatus(); return <button className="primary-button wide" disabled={pending} type="submit">{pending ? "导入中…" : "批量创建"}</button>; }
