import { describe, expect, it } from "vitest";
import { validateResumeExperienceSelection, validateResumeUpload } from "@/modules/resume-library/validation";

describe("validateResumeUpload", () => {
  it("接受 PDF 或 DOCX 且拒绝超过 10MB 的文件", () => {
    expect(validateResumeUpload({ name: "AI-产品经理.pdf", type: "application/pdf", size: 1024 })).toEqual({ extension: "pdf" });
    expect(() => validateResumeUpload({ name: "resume.exe", type: "application/octet-stream", size: 1024 })).toThrow("VALIDATION_ERROR");
    expect(() => validateResumeUpload({ name: "resume.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 * 1024 * 1024 + 1 })).toThrow("VALIDATION_ERROR");
  });
});

describe("validateResumeExperienceSelection", () => {
  it("上传简历时要求至少关联已有经历或快速创建经历", () => {
    expect(() => validateResumeExperienceSelection({ experienceIds: [], newExperienceNames: ["  "], required: true })).toThrow("VALIDATION_ERROR");
    expect(validateResumeExperienceSelection({ experienceIds: ["experience-1", "experience-1"], newExperienceNames: ["项目 A", " 项目 A ", "项目 B"], required: true })).toEqual({
      experienceIds: ["experience-1"],
      newExperienceNames: ["项目 A", "项目 B"],
    });
  });
});
