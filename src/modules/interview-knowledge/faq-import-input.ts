import { z } from "zod";
import { NO_SOURCE_INTERVIEW, validateFaqBatch, type FaqImportItem } from "./faq-batch";

const source = z.union([z.uuid(), z.literal(NO_SOURCE_INTERVIEW)]).transform((value) => value === NO_SOURCE_INTERVIEW ? null : value);
const content = z.object({ question: z.string().trim().min(1).max(10_000), answer: z.string().trim().max(100_000) });
const metadata = z.object({ binding: z.enum(["bound", "unbound"]), category: z.string().trim().max(64).nullable(), experienceId: z.uuid().nullable() });

export function parseFaqImportForm(formData: FormData) {
  const idempotencyKey = z.string().min(8).max(255).parse(formData.get("idempotencyKey"));
  const replaceBatchId = z.uuid().optional().parse(formData.get("replaceBatchId") ?? undefined);
  let interviewId: string | null;
  let items: FaqImportItem[];
  if (formData.has("groupsJson")) {
    const raw = z.string().max(1_000_000).parse(formData.get("groupsJson"));
    const groups = z.array(metadata.extend({
      id: z.string().min(1).max(100), interviewId: source, items: z.array(content).min(1).max(100),
    })).min(1).max(100).parse(JSON.parse(raw));
    if (new Set(groups.map((group) => group.id)).size !== groups.length) throw new Error("VALIDATION_ERROR: 分组标识重复。");
    interviewId = null;
    items = groups.flatMap((group) => group.items.map((item) => ({
      ...item, groupId: group.id, sourceInterviewId: group.interviewId,
      binding: group.binding, experienceId: group.experienceId, category: group.category,
    })));
  } else {
    interviewId = source.parse(formData.get("interviewId"));
    const raw = z.string().min(2).max(1_000_000).parse(formData.get("itemsJson"));
    items = z.array(content.extend(metadata.shape)).min(1).max(100).parse(JSON.parse(raw));
  }
  validateFaqBatch(items);
  return { idempotencyKey, interviewId, items, replaceBatchId };
}
