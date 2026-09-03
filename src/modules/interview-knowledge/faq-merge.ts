export function prepareFaqMerge(
  existing: { question: string; frequency: number },
  incoming: Array<{ question: string }>,
  answer: string,
) {
  if (!incoming.length) throw new Error("VALIDATION_ERROR: a merge needs at least one incoming FAQ");
  const variants = [...new Set([existing.question, ...incoming.map((item) => item.question)]
    .flatMap((question) => question.split(" / ").map((part) => part.trim()).filter(Boolean)))];
  return {
    question: variants.join(" / "),
    answer: answer.trim(),
    frequency: existing.frequency + incoming.length,
    addedOccurrences: incoming.length,
  };
}
