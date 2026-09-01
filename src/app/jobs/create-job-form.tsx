"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Link2 } from "lucide-react";
import {
  createJobTrackAction,
  type CreateJobTrackFormState,
} from "./actions";

const initialState: CreateJobTrackFormState = { error: null };

export function CreateJobForm({ idempotencyKey, resumes }: { idempotencyKey: string; resumes: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(createJobTrackAction, initialState);
  const [creationMode, setCreationMode] = useState<"planned" | "active">("planned");

  return (
    <form action={action} className="create-form">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="form-heading">
        <p className="eyebrow">快捷新增</p>
        <h2>{creationMode === "planned" ? "新增待投递" : "新增已投递"}</h2>
        <p>{creationMode === "planned" ? "先保存岗位上下文，真正投递后再绑定当时使用的简历。" : "补录已经完成的投递，并立即进入进行中。"}</p>
      </div>
      <label>新增方式<select name="creationMode" value={creationMode} onChange={(event) => setCreationMode(event.target.value as "planned" | "active")}><option value="planned">待投递</option><option value="active">已投递</option></select></label>
      <label>
        公司
        <input autoComplete="organization" name="companyName" placeholder="例如：华为" required />
      </label>
      {creationMode === "active" && <><label>投递简历<select name="resumeId" required><option value="">选择简历版本</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label><label>投递时间<input name="submittedAt" type="datetime-local" required /></label>{!resumes.length && <p className="form-hint">还没有简历版本，请先在任一岗位详情上传简历。</p>}</>}
      <label>
        岗位
        <input name="roleName" placeholder="例如：AI 解决方案工程师" required />
      </label>
      <label>
        岗位 JD 文本
        <textarea name="jobDescription" placeholder="粘贴岗位职责和要求，或在下方上传截图…" rows={8} />
      </label>
      <label>
        JD 图片（可选）
        <input accept="image/jpeg,image/png,image/webp" name="jobDescriptionImages" type="file" multiple />
      </label>
      <p className="form-hint">JD 文本和图片至少填写一种；图片一次最多 4 张，每张最大 5MB。</p>
      <label>
        <span className="label-with-icon"><Link2 size={15} /> 岗位链接（可选）</span>
        <input name="jobUrl" placeholder="https://" type="url" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <SubmitButton disabled={creationMode === "active" && !resumes.length} label={creationMode === "planned" ? "保存为待投递" : "保存为已投递"} />
    </form>
  );
}

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button wide" disabled={pending || disabled} type="submit">
      {pending ? "保存中…" : label}
      {!pending ? <ArrowRight size={17} /> : null}
    </button>
  );
}
