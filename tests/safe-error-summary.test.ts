import { describe, expect, it } from "vitest";
import { summarizeServerError } from "@/shared/logging/server-error";

describe("summarizeServerError", () => {
  it("保留稳定领域错误码但不返回原始消息", () => {
    const summary = summarizeServerError(new Error("VALIDATION_ERROR: transcript contains 私密面试内容"));

    expect(summary).toEqual({ name: "Error", code: "VALIDATION_ERROR" });
    expect(JSON.stringify(summary)).not.toContain("私密面试内容");
  });

  it("未知异常只返回固定类型", () => {
    expect(summarizeServerError("resume body and secret URL")).toEqual({ name: "UnknownError" });
  });

  it("保留 SDK 异常名称但不保留消息或堆栈", () => {
    const error = new Error("https://storage.example/private?token=secret");
    error.name = "NoSuchKey";

    expect(summarizeServerError(error)).toEqual({ name: "NoSuchKey" });
  });
});
