export const experienceFaqCategories = [
  "项目背景",
  "方案设计",
  "技术实现",
  "决策思考",
  "项目结果",
  "复盘反思",
  "其他",
] as const;

export const generalFaqCategories = [
  "求职动机",
  "综合能力",
  "协作沟通",
  "行为面试",
  "职业规划",
  "其他",
] as const;

export type FaqBatchItem = {
  question: string;
  answer: string;
  kind: "experience" | "general";
  category: string;
  experienceId: string | null;
};

export function validateFaqBatch(items: FaqBatchItem[]): FaqBatchItem[] {
  if (items.length === 0 || items.length > 100) {
    throw new Error("VALIDATION_ERROR: FAQ batch must contain 1 to 100 items");
  }
  return items.map((item) => {
    const question = item.question.trim();
    const answer = item.answer.trim();
    const category = item.category.trim();
    if (!question || !answer) throw new Error("VALIDATION_ERROR: FAQ question and answer are required");
    if (item.kind === "experience" && !item.experienceId) {
      throw new Error("VALIDATION_ERROR: experience FAQ requires an Experience");
    }
    if (item.kind === "general" && item.experienceId) {
      throw new Error("VALIDATION_ERROR: general FAQ cannot reference an Experience");
    }
    const categories: readonly string[] = item.kind === "experience" ? experienceFaqCategories : generalFaqCategories;
    if (!categories.includes(category)) throw new Error("VALIDATION_ERROR: FAQ category is not supported");
    return { ...item, question, answer, category };
  });
}
