"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Link2 } from "lucide-react";
import { ResumeSelectionFields, type ExperienceOption, type ResumeOption } from "@/components/resume-selection-fields";
import {
  createJobTrackAction,
  type CreateJobTrackFormState,
} from "./actions";

const initialState: CreateJobTrackFormState = { error: null, success: null };

export function CreateJobForm({ idempotencyKey, resumes, experiences, fixedCreationMode, onSuccess }: {
  idempotencyKey: string;
  resumes: ResumeOption[];
  experiences: ExperienceOption[];
  fixedCreationMode?: "planned" | "active";
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createJobTrackAction, initialState);
  const [creationMode, setCreationMode] = useState<"planned" | "active">(fixedCreationMode ?? "planned");

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [onSuccess, state.success]);

  return (
    <form action={action} className="create-form" id="create-job">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="form-heading">
        <h2>{creationMode === "planned" ? "新增待投递" : "新增已投递"}</h2>
        <p>{creationMode === "planned" ? "先保存岗位上下文，真正投递后再绑定当时使用的简历。" : "补录已经完成的投递，并立即进入进行中。"}</p>
      </div>
      {fixedCreationMode ? <input name="creationMode" type="hidden" value={fixedCreationMode} /> : <label>新增方式<select name="creationMode" value={creationMode} onChange={(event) => setCreationMode(event.target.value as "planned" | "active")}><option value="planned">待投递</option><option value="active">已投递</option></select></label>}
      <label>
        公司
        <input autoComplete="organization" name="companyName" placeholder="例如：华为" required />
      </label>
      {creationMode === "active" && <><ResumeSelectionFields experiences={experiences} resumes={resumes} /><label>投递时间<input name="submittedAt" type="datetime-local" required /></label></>}
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
      {state.success ? <p className="form-success">{state.success}</p> : null}
      <SubmitButton label={creationMode === "planned" ? "保存为待投递" : "保存为已投递"} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button wide" disabled={pending} type="submit">
      {pending ? "保存中…" : label}
      {!pending ? <ArrowRight size={17} /> : null}
    </button>
  );
}
