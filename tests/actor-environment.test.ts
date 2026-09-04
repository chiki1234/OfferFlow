import { describe, expect, it } from "vitest";
import {
  resolveActorFromEnvironment,
  resolveAuthenticationMode,
  validateAuthenticationEnvironment,
} from "@/shared/actor/actor-environment";

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

  it("支持账号密码认证模式", () => {
    expect(resolveAuthenticationMode({ AUTH_MODE: "password", NODE_ENV: "production" })).toBe("password");
    expect(() =>
      validateAuthenticationEnvironment({
        APP_URL: "https://jobs.example.com",
        AUTH_MODE: "password",
        AUTH_SECRET: "a-secure-authentication-secret-value",
        NODE_ENV: "production",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "mail-secret",
        SMTP_FROM: "OfferFlow <no-reply@example.com>",
      }),
    ).not.toThrow();
  });

  it("账号密码模式要求安全密钥和应用地址", () => {
    expect(() =>
      validateAuthenticationEnvironment({
        APP_URL: "https://jobs.example.com",
        AUTH_MODE: "password",
        AUTH_SECRET: "too-short",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "mail-secret",
        SMTP_FROM: "OfferFlow <no-reply@example.com>",
      }),
    ).toThrow("AUTH_SECRET must contain at least 32 characters");
  });

  it("公开账号模式缺少发信配置时拒绝就绪", () => {
    expect(() =>
      validateAuthenticationEnvironment({
        APP_URL: "https://jobs.example.com",
        AUTH_MODE: "password",
        AUTH_SECRET: "a-secure-authentication-secret-value",
        NODE_ENV: "production",
      }),
    ).toThrow("SMTP_HOST");
  });

  it("本地单用户模式要求配置用户 ID", () => {
    expect(() => resolveActorFromEnvironment({ AUTH_MODE: "local", NODE_ENV: "development" })).toThrow(
      "APP_USER_ID is required when AUTH_MODE=local",
    );
  });
});
