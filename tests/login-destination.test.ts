import { describe, expect, it } from "vitest";
import { getLoginDestination } from "@/shared/actor/login-destination";

describe("登录后的站内跳转", () => {
  it("保留站内路径和筛选条件，拒绝浏览器会解释为外站的地址", () => {
    expect(getLoginDestination("/jobs?status=active#list")).toBe("/jobs?status=active#list");
    for (const value of [undefined, ["/jobs"], "https://example.com", "//example.com", "/\\example.com", "/\n/example.com"]) {
      expect(getLoginDestination(value)).toBe("/");
    }
  });
});
