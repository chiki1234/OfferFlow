export type FaqForSimilarity = {
  id: string;
  question: string;
  experienceId: string | null;
};

export type FaqSimilarityRequest = {
  incoming: Array<{ id: string; question: string }>;
  candidates: Array<{ id: string; question: string }>;
};

export type FaqSimilarityMatch = {
  incomingFaqId: string;
  existingFaqId: string | null;
};

export type FaqSimilarityGateway = {
  findClosestMatches(request: FaqSimilarityRequest): Promise<FaqSimilarityMatch[]>;
  mergeAnswers(request: { question: string; answers: string[] }): Promise<string>;
};

export async function analyzeFaqSimilarity(
  input: { incoming: FaqForSimilarity[]; existing: FaqForSimilarity[] },
  gateway: FaqSimilarityGateway,
  onMatch?: (match: FaqSimilarityMatch) => Promise<void>,
): Promise<FaqSimilarityMatch[]> {
  const existingByScope = groupByScope(input.existing);
  const matches: FaqSimilarityMatch[] = [];

  // One new question per request, in import order; never overlap provider calls.
  for (const incoming of input.incoming) {
    const candidates = existingByScope.get(incoming.experienceId ?? "__unbound__") ?? [];
    if (!candidates.length) {
      const match = { incomingFaqId: incoming.id, existingFaqId: null };
      matches.push(match);
      await onMatch?.(match);
      continue;
    }

    const result = await gateway.findClosestMatches({
      incoming: [{ id: incoming.id, question: incoming.question }],
      candidates: candidates.map(({ id, question }) => ({ id, question })),
    });
    assertValidMatches(result, [incoming], candidates);
    matches.push(result[0]);
    await onMatch?.(result[0]);
  }
  return matches;
}

function assertValidMatches(
  matches: FaqSimilarityMatch[],
  incoming: FaqForSimilarity[],
  candidates: FaqForSimilarity[],
) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  const candidateIds = new Set(candidates.map((item) => item.id));
  const returnedIds = new Set<string>();
  const invalid = matches.length !== incoming.length || matches.some((match) => {
    if (!incomingIds.has(match.incomingFaqId) || returnedIds.has(match.incomingFaqId)) return true;
    returnedIds.add(match.incomingFaqId);
    return match.existingFaqId !== null && !candidateIds.has(match.existingFaqId);
  });
  if (invalid) throw new Error("AI_RESPONSE_INVALID: similarity result referenced an unexpected FAQ");
}

function groupByScope(items: FaqForSimilarity[]) {
  const groups = new Map<string, FaqForSimilarity[]>();
  for (const item of items) {
    const scope = item.experienceId ?? "__unbound__";
    groups.set(scope, [...(groups.get(scope) ?? []), item]);
  }
  return groups;
}
