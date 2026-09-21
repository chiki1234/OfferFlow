import { z } from "zod";
import { validateResumeUpload } from "@/modules/resume-library/validation";

export type JobFieldErrors = Record<string, string>;

/** Shared preflight: collect all correctable errors before uploading any files. */
export function validateCreateJobForm(data: FormData): JobFieldErrors {
  const errors: JobFieldErrors = {};
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const checkText = (name: string, label: string, max: number, required = false) => {
    if (required && !text(name)) errors[name] = `请填写${label}`;
    else if (text(name).length > max) errors[name] = `${label}最多 ${max} 字`;
  };
  checkText("companyName", "公司名称", 255, true);
  const ranks = new Map<number, string>();
  for (const key of data.getAll("roleKeys").map(String)) {
    const prefix = `roles.${key}.`;
    checkText(prefix + "roleName", "岗位名称", 255, true);
    checkText(prefix + "department", "部门", 255);
    checkText(prefix + "jobDescription", "JD 文本", 50000);
    if (text(prefix + "jobUrl") && !z.url().safeParse(text(prefix + "jobUrl")).success) errors[prefix + "jobUrl"] = "请填写完整有效的岗位链接";
    const rankField = prefix + "preferenceRank";
    if (text(rankField)) {
      const rank = Number(text(rankField));
      if (!Number.isSafeInteger(rank) || rank < 1) errors[rankField] = "请选择有效志愿";
      else if (ranks.has(rank)) {
        errors[rankField] = errors[ranks.get(rank)!] = "同公司志愿不能重复";
      } else ranks.set(rank, rankField);
    }
    if (text("creationMode") !== "active") continue;
    if (text(prefix + "resumeMode") === "existing") {
      if (!z.uuid().safeParse(text(prefix + "resumeId")).success) errors[prefix + "resumeId"] = "请选择投递简历";
    } else if (text(prefix + "resumeMode") === "upload") {
      checkText(prefix + "resumeName", "简历版本名称", 255);
      const file = data.get(prefix + "resumeFile");
      try {
        if (!(file instanceof File)) throw new Error("missing");
        validateResumeUpload(file);
      } catch { errors[prefix + "resumeFile"] = "请选择 PDF 或 DOCX 简历，文件不超过 10MB"; }
      const ids = data.getAll(prefix + "experienceIds").map(String);
      const names = data.getAll(prefix + "newExperienceNames").map(String).map(name => name.trim()).filter(Boolean);
      if (!ids.length && !names.length) errors[prefix + "experiences"] = "请至少关联一项经历，或添加一个新经历名称";
      else if (ids.some(id => !z.uuid().safeParse(id).success)) errors[prefix + "experiences"] = "请重新选择有效的经历";
      if (names.some(name => name.length > 255)) errors[prefix + "newExperienceNames"] = "每个经历名称最多 255 字";
    } else errors[prefix + "resumeMode"] = "请选择简历来源";
  }
  return errors;
}
