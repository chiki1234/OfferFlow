import { describe, expect, it } from "vitest";
import { validateTranscriptUpload } from "@/modules/transcript-assets/validation";

describe("validateTranscriptUpload", () => {
  it("接受 TXT、PDF 和 DOCX", () => {
    expect(validateTranscriptUpload({ name: "一面.txt", type: "text/plain", size: 100 })).toEqual({ extension: "txt" });
    expect(validateTranscriptUpload({ name: "一面.pdf", type: "application/pdf", size: 100 })).toEqual({ extension: "pdf" });
    expect(validateTranscriptUpload({ name: "一面.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100 })).toEqual({ extension: "docx" });
  });

  it("拒绝空文件、超限文件和不支持的格式", () => {
    expect(() => validateTranscriptUpload({ name: "empty.txt", type: "text/plain", size: 0 })).toThrow("empty");
    expect(() => validateTranscriptUpload({ name: "large.txt", type: "text/plain", size: 10 * 1024 * 1024 + 1 })).toThrow("10MB");
    expect(() => validateTranscriptUpload({ name: "audio.mp3", type: "audio/mpeg", size: 100 })).toThrow("TXT, PDF, or DOCX");
  });
});
