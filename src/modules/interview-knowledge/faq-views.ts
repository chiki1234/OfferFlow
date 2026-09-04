import type { FaqLibraryFilters } from "./faq-filters";

export type FaqLibraryView = "questions" | "experiences" | "general";

export function buildFaqViewHref(filters: FaqLibraryFilters, view: FaqLibraryView) {
  const params = new URLSearchParams();
  if (view !== "questions") params.set("view", view);
  if (filters.query) params.set("q", filters.query);
  if (filters.binding) params.set("binding", filters.binding);
  if (filters.experienceId) params.set("experienceId", filters.experienceId);
  if (filters.category) params.set("category", filters.category);
  if (filters.settings) params.set("settings", filters.settings);
  const query = params.toString();
  return query ? `/faq?${query}` : "/faq";
}

export function buildGeneralFaqGroupHref(filters: FaqLibraryFilters, category: string | null) {
  const href = buildFaqViewHref(filters, "general");
  const group = new URLSearchParams(category === null ? { uncategorized: "1" } : { group: category });
  return `${href}&${group}`;
}

export function groupGeneralFaqs<T extends { category: string | null; experienceId: string | null }>(
  faqs: readonly T[], categories: readonly string[],
) {
  const groups = new Map<string | null, T[]>(categories.map((category) => [category, []]));
  for (const faq of faqs) {
    if (faq.experienceId !== null) continue;
    const items = groups.get(faq.category) ?? [];
    items.push(faq);
    groups.set(faq.category, items);
  }
  const uncategorized = groups.get(null) ?? [];
  groups.delete(null);
  return [
    ...Array.from(groups, ([category, items]) => ({ category, name: category!, faqs: items })),
    { category: null, name: "未分类", faqs: uncategorized },
  ];
}
