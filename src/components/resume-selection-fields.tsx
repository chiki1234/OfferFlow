"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type ResumeOption = { id: string; name: string };
export type ExperienceOption = { id: string; name: string };

export function ResumeSelectionFields({
  resumes,
  experiences,
  prefix = "",
  defaultResumeId = "",
  fieldErrors = {},
  errorIdPrefix = "resume",
}: {
  prefix?: string;
  fieldErrors?: Record<string, string>;
  errorIdPrefix?: string;
  defaultResumeId?: string;
  resumes: ResumeOption[];
  experiences: ExperienceOption[];
}) {
  const [mode, setMode] = useState<"existing" | "upload">(resumes.length ? "existing" : "upload");
  const [newExperienceNames, setNewExperienceNames] = useState<string[]>([]);

  function field(name: string) {
    return { "aria-invalid": fieldErrors[prefix + name] ? true as const : undefined, "aria-describedby": fieldErrors[prefix + name] ? errorIdPrefix + "-" + prefix + name + "-error" : undefined };
  }
  function error(name: string) {
    return fieldErrors[prefix + name] ? <span className="job-field-error" id={errorIdPrefix + "-" + prefix + name + "-error"}>{fieldErrors[prefix + name]}</span> : null;
  }
  return (
    <div className="resume-selection-fields">
      <label>简历来源<select {...field("resumeMode")} name={prefix + "resumeMode"} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="existing" disabled={!resumes.length}>选择已有简历</option><option value="upload">上传新简历</option></select>{error("resumeMode")}</label>
      {mode === "existing" ? (
        <label>投递简历<select {...field("resumeId")} name={prefix + "resumeId"} defaultValue={defaultResumeId} required><option value="">选择简历版本</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select>{error("resumeId")}</label>
      ) : (
        <>
          <label>简历文件<input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" {...field("resumeFile")} name={prefix + "resumeFile"} type="file" required />{error("resumeFile")}</label>
          <label>版本名称（可选）<input {...field("resumeName")} name={prefix + "resumeName"} placeholder="例如：AI 产品经理 V3" />{error("resumeName")}</label>
          <p className="form-hint">支持 PDF 或 DOCX，最大 10MB。上传时必须至少关联一项经历。</p>
          <div {...field("experiences")} tabIndex={fieldErrors[prefix + "experiences"] ? -1 : undefined} className="resume-experience-selection">
          {experiences.length > 0 && <fieldset className="experience-checks"><legend>关联已有经历</legend>{experiences.map((experience) => <label key={experience.id}><input name={prefix + "experienceIds"} type="checkbox" value={experience.id} />{experience.name}</label>)}</fieldset>}
          <div className="quick-experience-fields">
            <div className="field-heading"><strong>快速创建经历</strong><button className="text-button" type="button" onClick={() => setNewExperienceNames((current) => [...current, ""])}><Plus size={14} />添加经历</button></div>
            {newExperienceNames.map((name, index) => <div className="quick-experience-row" key={index}><input {...field("newExperienceNames")} aria-label={`新经历 ${index + 1}`} name={prefix + "newExperienceNames"} value={name} onChange={(event) => setNewExperienceNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="只需填写经历名称" /><button aria-label={`删除新经历 ${index + 1}`} className="icon-button" type="button" onClick={() => setNewExperienceNames((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}
            {error("newExperienceNames")}
            {!newExperienceNames.length && <p className="form-hint">没有合适的已有经历时，可以在这里一次添加多个名称。</p>}
          </div>
          {error("experiences")}
          </div>
        </>
      )}
    </div>
  );
}
