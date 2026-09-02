export const defaultFaqCategories = [
  "求职动机",
  "综合能力",
  "协作沟通",
  "行为面试",
  "职业规划",
  "其他",
] as const;

export type FaqKind = "experience" | "general";
export type FaqBinding = "bound" | "unbound";
export type FaqCategoryConfig = string[];

export type FaqBatchItem = {
  question: string;
  answer: string;
  binding: FaqBinding;
  category: string | null;
  experienceId: string | null;
};

export type ValidatedFaqBatchItem = Omit<FaqBatchItem, "binding"> & { kind: FaqKind };

export function isFaqSettingsComplete(item: Pick<FaqBatchItem, "category" | "experienceId">) {
  return Boolean(item.experienceId || item.category);
}

export function validateFaqBatch(items: FaqBatchItem[]): ValidatedFaqBatchItem[] {
  if (items.length === 0 || items.length > 100) {
    throw new Error("VALIDATION_ERROR: FAQ batch must contain 1 to 100 items");
  }
  return items.map((item) => {
    const question = item.question.trim();
    const answer = item.answer.trim();
    const category = item.category?.trim() || null;
    if (!question) throw new Error("VALIDATION_ERROR: FAQ question is required");
    if (item.binding === "bound") {
      if (!item.experienceId) throw new Error("VALIDATION_ERROR: experience-bound FAQ requires an Experience");
      if (category) throw new Error("VALIDATION_ERROR: experience-bound FAQ cannot have a category");
      return { question, answer, kind: "experience", category: null, experienceId: item.experienceId };
    }
    if (item.experienceId) throw new Error("VALIDATION_ERROR: unbound FAQ cannot reference an Experience");
    return { question, answer, kind: "general", category, experienceId: null };
  });
}
