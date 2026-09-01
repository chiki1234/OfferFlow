import { describe, expect, it } from "vitest";
import { resolveActorFromEnvironment } from "@/shared/actor/actor-environment";

describe("resolveActorFromEnvironment", () => {
  const userId = "00000000-0000-4000-8000-000000000001";

  it("开发环境默认使用本地单用户模式", () => {
    expect(resolveActorFromEnvironment({ APP_USER_ID: userId, NODE_ENV: "development" })).toEqual({ userId });
  });

  it("生产环境要求显式声明认证模式", () => {
    expect(() =>
      resolveActorFromEnvironment({
        APP_USER_ID: userId,
        NODE_ENV: "production",
        ALLOW_LOCAL_AUTH_IN_PRODUCTION: "true",
      }),
    ).toThrow("AUTH_MODE must be explicitly set in production");
  });

  it("生产环境默认拒绝固定用户身份", () => {
    expect(() =>
      resolveActorFromEnvironment({
        APP_USER_ID: userId,
        AUTH_MODE: "local",
        NODE_ENV: "production",
      }),
    ).toThrow("ALLOW_LOCAL_AUTH_IN_PRODUCTION=true");
  });

  it("生产环境显式确认后才允许本地单用户模式", () => {
    expect(
      resolveActorFromEnvironment({
        APP_USER_ID: userId,
        AUTH_MODE: "local",
        NODE_ENV: "production",
        ALLOW_LOCAL_AUTH_IN_PRODUCTION: "true",
      }),
    ).toEqual({ userId });
  });

  it("拒绝尚未实现的认证模式", () => {
    expect(() =>
      resolveActorFromEnvironment({
        APP_USER_ID: userId,
        AUTH_MODE: "password",
        NODE_ENV: "development",
      }),
    ).toThrow('Unsupported AUTH_MODE "password"');
  });

  it("本地单用户模式要求配置用户 ID", () => {
    expect(() => resolveActorFromEnvironment({ AUTH_MODE: "local", NODE_ENV: "development" })).toThrow(
      "APP_USER_ID is required when AUTH_MODE=local",
    );
  });
});
