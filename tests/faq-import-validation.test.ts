import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitFaqBatchAction } from "../src/app/faq/actions";
import { beginFaqAnalysis, importEditedFaqBatch } from "../src/app/faq/import-actions";

const { commit, createBatch, finalize } = vi.hoisted(() => ({ commit: vi.fn(), createBatch: vi.fn(), finalize: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/actor/current-actor", () => ({ getCurrentActor: async () => ({ userId: "test-user" }) }));
vi.mock("@/shared/logging/server-error", () => ({ logServerError: vi.fn() }));
vi.mock("@/modules/interview-knowledge/service", () => ({ commitFaqBatch: commit }));
vi.mock("@/modules/interview-knowledge/faq-import", () => ({
  createFaqImportBatch: createBatch,
  finalizeFaqImportBatch: finalize,
  faqImportErrorMessage: () => "导入失败，请检查输入。",
}));

const interviewId = "e7acfbf1-dce9-446a-aee2-677b2a2c8623";
const batchId = "a47b2cb5-64ce-4a21-9e60-756d769d520f";
const actions = [
  { name: "direct import", run: (data: FormData) => commitFaqBatchAction({ error: null, success: null }, data) },
  { name: "AI analysis", run: beginFaqAnalysis },
  { name: "edited import", run: importEditedFaqBatch },
];

function form(source: string | null) {
  const data = new FormData();
  data.set("idempotencyKey", "test-import-token");
  data.set("replaceBatchId", batchId);
  data.set("itemsJson", JSON.stringify([{ question: "测试问题", answer: "", binding: "unbound", category: null, experienceId: null }]));
  if (source !== null) data.set("interviewId", source);
  return data;
}

beforeEach(() => {
  commit.mockResolvedValue({ faqIds: ["faq-1"] });
  createBatch.mockResolvedValue({ batchId });
  finalize.mockResolvedValue({ faqIds: ["faq-1"], importedCount: 1, mergedCount: 0 });
});

describe.each(actions)("required source in $name", ({ run }) => {
  it.each([null, "", "   ", "invalid-id"])("rejects missing or invalid source before persistence: %s", async (source) => {
    expect((await run(form(source))).error).toBeTruthy();
    expect(commit).not.toHaveBeenCalled();
    expect(createBatch).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("passes the selected source through with optional fields empty", async () => {
    expect((await run(form(interviewId))).error).toBeNull();
    const persistence = commit.mock.calls.length ? commit : createBatch;
    expect(persistence).toHaveBeenCalledWith(expect.objectContaining({ interviewId, items: [{ question: "测试问题", answer: "", binding: "unbound", category: null, experienceId: null }] }));
  });

  it("accepts an explicit no-source choice and persists null instead of the option value", async () => {
    expect((await run(form("none"))).error).toBeNull();
    const persistence = commit.mock.calls.length ? commit : createBatch;
    expect(persistence).toHaveBeenCalledWith(expect.objectContaining({ interviewId: null }));
  });
});
