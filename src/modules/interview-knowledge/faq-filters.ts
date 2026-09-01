import { experienceFaqCategories, generalFaqCategories } from "./faq-batch";

export type FaqLibraryFilters = {
  query: string;
  kind: "experience" | "general" | null;
  category: string | null;
};

export const faqCategoryOptions: string[] = Array.from(new Set<string>([
  ...experienceFaqCategories,
  ...generalFaqCategories,
]));

export function normalizeFaqLibraryFilters(input: {
  query?: string;
  kind?: string;
  category?: string;
}): FaqLibraryFilters {
  const query = input.query?.trim().slice(0, 100) ?? "";
  const kind = input.kind === "experience" || input.kind === "general" ? input.kind : null;
  const category = input.category && faqCategoryOptions.includes(input.category) ? input.category : null;
  return { query, kind, category };
}
