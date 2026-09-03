import { defaultFaqCategories } from "./faq-batch";

export type FaqLibraryFilters = {
  query: string;
  binding: "bound" | "unbound" | null;
  experienceId: string | null;
  category: string | null;
  settings: "complete" | "incomplete" | null;
};

export const faqCategoryOptions: string[] = [...defaultFaqCategories];

export function normalizeFaqLibraryFilters(input: {
  query?: string;
  binding?: string;
  experienceId?: string;
  category?: string;
  settings?: string;
}, categoryOptions: readonly string[] = faqCategoryOptions, experienceIds: readonly string[] = []): FaqLibraryFilters {
  const query = input.query?.trim().slice(0, 100) ?? "";
  const requestedBinding = input.binding === "bound" || input.binding === "unbound" ? input.binding : null;
  const requestedExperienceId = input.experienceId && experienceIds.includes(input.experienceId) ? input.experienceId : null;
  const requestedCategory = input.category && categoryOptions.includes(input.category) ? input.category : null;
  const binding = requestedExperienceId ? "bound" : requestedCategory && !requestedBinding ? "unbound" : requestedBinding;
  const experienceId = binding === "unbound" ? null : requestedExperienceId;
  const category = binding === "bound" ? null : requestedCategory;
  const settings = input.settings === "complete" || input.settings === "incomplete" ? input.settings : null;
  return { query, binding, experienceId, category, settings };
}
