import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveJobTrackStatus, jobWaitingDays, type JobTrackFacts } from "../src/modules/workspace-queries/derive-job-track-status";

const mocks = vi.hoisted(() => ({ set: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/shared/actor/current-actor", () => ({ getCurrentActor: async () => ({ userId: "test-owner" }) }));
import { saveAttentionDays } from "../src/app/attention-settings";

describe("关注等待设置", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["", "0", "366", "1.5", "bad"])("拒绝无效天数 %s 且不保存", async value => {
    const form = new FormData(); form.set("days", value);
    expect((await saveAttentionDays(form)).error).toBeTruthy();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it.each([1, 30, 365])("按当前账号保存合法天数 %i 并刷新工作台", async days => {
    const form = new FormData(); form.set("days", String(days));
    expect(await saveAttentionDays(form)).toEqual({ error: null });
    expect(mocks.set).toHaveBeenCalledWith("attention-days-test-owner", String(days), expect.objectContaining({ httpOnly: true, path: "/" }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
  });
  it("等待满设置天数才提醒，记录新进展后重置", () => {
    const now = new Date("2026-09-15T00:00:00Z");
    const facts: JobTrackFacts = { lifecycle: "active", submittedAt: "2026-09-08T00:00:00Z", assessments: [], interviews: [], tasks: [] };
    expect(jobWaitingDays(facts, now)).toBe(7);
    expect(deriveJobTrackStatus(facts, now, 7).attentionFlags).toContain("waiting_long");
    expect(deriveJobTrackStatus(facts, now, 8).attentionFlags).not.toContain("waiting_long");
    facts.lastProgressAt = "2026-09-14T12:00:00Z";
    expect(jobWaitingDays(facts, now)).toBe(0);
    expect(deriveJobTrackStatus(facts, now, 1).attentionFlags).not.toContain("waiting_long");
  });
});
