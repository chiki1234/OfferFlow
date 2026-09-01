import { describe, expect, it, vi } from "vitest";
import { runReadinessChecks } from "@/shared/health/readiness-checks";

describe("runReadinessChecks", () => {
  it("所有依赖可用时返回完整通过状态", async () => {
    await expect(
      runReadinessChecks({
        authentication: async () => undefined,
        database: async () => undefined,
        objectStorage: async () => undefined,
      }),
    ).resolves.toEqual({ authentication: true, database: true, objectStorage: true });
  });

  it("单项失败时仍检查其余依赖且不泄露错误内容", async () => {
    const database = vi.fn(async () => undefined);
    const objectStorage = vi.fn(async () => undefined);

    await expect(
      runReadinessChecks({
        authentication: async () => {
          throw new Error("sensitive configuration detail");
        },
        database,
        objectStorage,
      }),
    ).resolves.toEqual({ authentication: false, database: true, objectStorage: true });
    expect(database).toHaveBeenCalledOnce();
    expect(objectStorage).toHaveBeenCalledOnce();
  });
});
