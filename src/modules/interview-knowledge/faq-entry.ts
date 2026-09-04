import { faqSourceInterviewId, NO_SOURCE_INTERVIEW, type FaqBinding, type FaqImportItem } from "./faq-batch";

export type FaqEntryCard = { id: string; question: string; answer: string; selected: boolean };
export type FaqEntryGroup = {
  id: string;
  interviewId: string;
  binding: FaqBinding | "";
  experienceId: string;
  category: string;
  cards: FaqEntryCard[];
  pasteOpen: boolean;
  raw: string;
};

export function newFaqEntryGroup(id: string): FaqEntryGroup {
  return { id, interviewId: "", binding: "", experienceId: "", category: "", cards: [newFaqEntryCard(`${id}-first`)], pasteOpen: false, raw: "" };
}

export function newFaqEntryCard(id: string): FaqEntryCard {
  return { id, question: "", answer: "", selected: true };
}

export function restoreFaqEntryGroups(items: FaqImportItem[], legacySource: string | null): FaqEntryGroup[] {
  const groups = new Map<string, FaqEntryGroup>();
  for (const [index, item] of items.entries()) {
    const interviewId = faqSourceInterviewId(item, legacySource) ?? NO_SOURCE_INTERVIEW;
    const signature = JSON.stringify([interviewId, item.binding, item.experienceId, item.category]);
    // Keep explicit group boundaries; older drafts are grouped by their effective settings.
    const key = JSON.stringify([item.groupId ?? "legacy", signature]);
    let group = groups.get(key);
    if (!group) {
      group = { ...newFaqEntryGroup(item.groupId ?? `restored-${index}`), interviewId, binding: item.binding, experienceId: item.experienceId ?? "", category: item.category ?? "", cards: [] };
      groups.set(key, group);
    }
    group.cards.push({ ...newFaqEntryCard(`restored-card-${index}`), question: item.question, answer: item.answer });
  }
  return groups.size ? [...groups.values()] : [newFaqEntryGroup("group-1")];
}

export function faqEntryPayload(groups: FaqEntryGroup[]) {
  return groups.flatMap((group) => {
    const items = group.cards.filter((card) => card.selected).map(({ question, answer }) => ({ question, answer }));
    return items.length ? [{ id: group.id, interviewId: group.interviewId, binding: group.binding,
      experienceId: group.binding === "bound" ? group.experienceId || null : null,
      category: group.binding === "unbound" ? group.category || null : null, items }] : [];
  });
}
