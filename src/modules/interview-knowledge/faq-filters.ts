import { defaultFaqCategories } from "./faq-batch";

export type FaqLibraryFilters = {
  query: string;
  binding: "bound" | "unbound" | null;
  category: string | null;
  settings: "complete" | "incomplete" | null;
};

export const faqCategoryOptions: string[] = [...defaultFaqCategories];

export function normalizeFaqLibraryFilters(input: {
  query?: string;
  binding?: string;
  category?: string;
  settings?: string;
}, categoryOptions: readonly string[] = faqCategoryOptions): FaqLibraryFilters {
  const query = input.query?.trim().slice(0, 100) ?? "";
  const requestedBinding = input.binding === "bound" || input.binding === "unbound" ? input.binding : null;
  const requestedCategory = input.category && categoryOptions.includes(input.category) ? input.category : null;
  const category = requestedBinding === "bound" ? null : requestedCategory;
  const binding = category && !requestedBinding ? "unbound" : requestedBinding;
  const settings = input.settings === "complete" || input.settings === "incomplete" ? input.settings : null;
  return { query, binding, category, settings };
}
