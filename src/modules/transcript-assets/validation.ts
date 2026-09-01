const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

const supportedTypes = new Map([
  ["text/plain", "txt"],
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
]);

export function validateTranscriptUpload(file: { name: string; type: string; size: number }) {
  if (file.size <= 0) throw new Error("VALIDATION_ERROR: transcript file is empty");
  if (file.size > MAX_TRANSCRIPT_BYTES) throw new Error("VALIDATION_ERROR: transcript file exceeds 10MB");
  const extension = supportedTypes.get(file.type);
  if (!extension || !file.name.toLowerCase().endsWith(`.${extension}`)) {
    throw new Error("VALIDATION_ERROR: transcript must be a TXT, PDF, or DOCX file");
  }
  return { extension };
}
