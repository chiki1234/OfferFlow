export type SafeErrorSummary = {
  name: string;
  code?: string;
};

const stableCodePattern = /^([A-Z][A-Z0-9_]+):/;

export function summarizeServerError(error: unknown): SafeErrorSummary {
  if (!(error instanceof Error)) return { name: "UnknownError" };

  const code = stableCodePattern.exec(error.message)?.[1];
  return code ? { name: error.name, code } : { name: error.name };
}

export function logServerError(context: string, error: unknown): void {
  console.error(context, summarizeServerError(error));
}
