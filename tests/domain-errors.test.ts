import { describe, expect, it } from "vitest";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";

describe("isDomainNotFoundError", () => {
  it("只把明确的 NOT_FOUND 领域错误识别为 404", () => {
    expect(isDomainNotFoundError(new Error("NOT_FOUND: job track was not found"))).toBe(true);
    expect(isDomainNotFoundError(new Error("DATABASE_ERROR: connection failed"))).toBe(false);
    expect(isDomainNotFoundError("NOT_FOUND: plain string")).toBe(false);
  });
});
