import { describe, expect, it } from "vitest";
import { parseFaqImportForm } from "../src/modules/interview-knowledge/faq-import-input";
import { restoreFaqEntryGroups } from "../src/modules/interview-knowledge/faq-entry";
import type { FaqImportItem } from "../src/modules/interview-knowledge/faq-batch";

const interview = "e7acfbf1-dce9-446a-aee2-677b2a2c8623";
const experience = "a47b2cb5-64ce-4a21-9e60-756d769d520f";
const item: FaqImportItem = { question: "问题", answer: "", binding: "unbound", category: null, experienceId: null };
const group = (id: string) => ({ id, interviewId: "none", binding: "unbound", category: null, experienceId: null, items: [{ question: "问题", answer: "" }] });
const form = (groups: unknown) => { const data = new FormData(); data.set("idempotencyKey", "test-entry-key"); data.set("groupsJson", JSON.stringify(groups)); return data; };

describe("FAQ grouped input", () => {
  it("flattens groups with explicit independent sources and complete settings", () => {
    const parsed = parseFaqImportForm(form([{ ...group("one"), interviewId: interview, binding: "bound", experienceId: experience }, group("two")]));
    expect(parsed.interviewId).toBeNull();
    expect(parsed.items).toEqual([{ ...item, groupId: "one", sourceInterviewId: interview, binding: "bound", experienceId: experience }, { ...item, groupId: "two", sourceInterviewId: null }]);
  });
  it.each([
    [], [group("same"), group("same")], [{ ...group("a"), items: [] }], [{ ...group("a"), interviewId: "" }],
    [{ ...group("a"), binding: "" }], [{ ...group("a"), binding: "bound" }], [{ ...group("a"), experienceId: experience }],
    [{ ...group("a"), binding: "bound", experienceId: experience, category: "综合" }],
    [{ ...group("a"), items: [{ question: " ", answer: "只有答案" }] }],
    [group("a"), { ...group("b"), items: Array.from({ length: 100 }, () => ({ question: "问题", answer: "" })) }],
  ])("rejects invalid groups before persistence: %j", (...groups) => { expect(() => parseFaqImportForm(form(groups.length === 0 ? [] : groups))).toThrow(); });
  it("still accepts old single-source form payloads", () => {
    const data = new FormData(); data.set("idempotencyKey", "legacy-entry-key"); data.set("interviewId", interview); data.set("itemsJson", JSON.stringify([item]));
    expect(parseFaqImportForm(data)).toMatchObject({ interviewId: interview, items: [item] });
  });
  it("restores separate identical groups and legacy heterogeneous metadata without losing questions", () => {
    const restored = restoreFaqEntryGroups([{ ...item, groupId: "one" }, { ...item, groupId: "two" }, { ...item, groupId: "one" }], interview);
    expect(restored.map((group) => group.cards.length)).toEqual([2, 1]);
    expect(restoreFaqEntryGroups([item, { ...item, binding: "bound", experienceId: experience }], interview)).toHaveLength(2);
  });
});
