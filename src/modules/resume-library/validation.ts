const MAX_RESUME_BYTES = 10 * 1024 * 1024;

const supportedTypes = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
]);

export function validateResumeUpload(file: { name: string; type: string; size: number }) {
  if (file.size <= 0) throw new Error("VALIDATION_ERROR: resume file is empty");
  if (file.size > MAX_RESUME_BYTES) throw new Error("VALIDATION_ERROR: resume file exceeds 10MB");
  const extension = supportedTypes.get(file.type);
  if (!extension || !file.name.toLowerCase().endsWith(`.${extension}`)) {
    throw new Error("VALIDATION_ERROR: resume must be a PDF or DOCX file");
  }
  return { extension };
}
