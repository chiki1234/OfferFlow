"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Link2 } from "lucide-react";
import {
  createJobTrackAction,
  type CreateJobTrackFormState,
} from "./actions";

const initialState: CreateJobTrackFormState = { error: null };

export function CreateJobForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action] = useActionState(createJobTrackAction, initialState);

  return (
    <form action={action} className="create-form">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="form-heading">
        <p className="eyebrow">快捷新增</p>
        <h2>新增待投递</h2>
        <p>先保存完整岗位上下文，真正投递后再绑定当时使用的简历。</p>
      </div>
      <label>
        公司
        <input autoComplete="organization" name="companyName" placeholder="例如：华为" required />
      </label>
      <label>
        岗位
        <input name="roleName" placeholder="例如：AI 解决方案工程师" required />
      </label>
      <label>
        岗位 JD
        <textarea name="jobDescription" placeholder="粘贴岗位职责和要求…" rows={8} required />
      </label>
      <label>
        <span className="label-with-icon"><Link2 size={15} /> 岗位链接（可选）</span>
        <input name="jobUrl" placeholder="https://" type="url" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button wide" disabled={pending} type="submit">
      {pending ? "保存中…" : "保存为待投递"}
      {!pending ? <ArrowRight size={17} /> : null}
    </button>
  );
}
