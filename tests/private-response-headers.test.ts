import { describe, expect, it } from "vitest";
import { privateResponseHeaders } from "@/shared/http/private-response-headers";

describe("privateResponseHeaders", () => {
  it("禁止私有数据被缓存、跨源嵌入或 MIME 猜测", () => {
    expect(privateResponseHeaders).toEqual({
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
  });
});
