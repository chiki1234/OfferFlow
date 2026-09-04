import { describe, expect, it, vi } from "vitest";
import {
  buildAccountEmail,
  deliverAccountEmail,
  readAccountEmailConfiguration,
} from "@/adapters/email/account-email";

describe("公开账号邮件", () => {
  it("读取完整 SMTP 配置并按端口推导安全连接", () => {
    expect(
      readAccountEmailConfiguration({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "secret",
        SMTP_FROM: "OfferFlow <no-reply@example.com>",
      }),
    ).toEqual({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "mailer",
      password: "secret",
      from: "OfferFlow <no-reply@example.com>",
    });
  });

  it("配置不完整时拒绝启动账号邮件能力", () => {
    expect(() => readAccountEmailConfiguration({ SMTP_HOST: "smtp.example.com" })).toThrow(
      "SMTP_PORT",
    );
    expect(() => readAccountEmailConfiguration({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "not-a-port",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "secret",
      SMTP_FROM: "no-reply@example.com",
    })).toThrow("SMTP_PORT");
  });

  it("验证和找回密码邮件说明用途并包含操作链接", () => {
    const verification = buildAccountEmail({
      kind: "verification",
      name: "小明",
      url: "https://offerflow.example/verify?token=one-time",
    });
    expect(verification.subject).toBe("验证你的 OfferFlow 邮箱");
    expect(verification.text).toContain("小明");
    expect(verification.text).toContain("https://offerflow.example/verify?token=one-time");

    const reset = buildAccountEmail({
      kind: "password-reset",
      name: "小明",
      url: "https://offerflow.example/reset?token=one-time",
    });
    expect(reset.subject).toBe("重设你的 OfferFlow 密码");
    expect(reset.text).toContain("https://offerflow.example/reset?token=one-time");
    expect(reset.text).toContain("忽略");
  });

  it("通过配置的 SMTP 发件人投递账号邮件", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "mail-1" }));
    const createTransport = vi.fn(() => ({ sendMail }));
    await deliverAccountEmail(
      {
        kind: "verification",
        to: "user@example.com",
        name: "新用户",
        url: "https://offerflow.example/verify",
      },
      {
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "secret",
        SMTP_FROM: "OfferFlow <no-reply@example.com>",
      },
      createTransport,
    );

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "mailer", pass: "secret" },
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "OfferFlow <no-reply@example.com>",
      to: "user@example.com",
      subject: "验证你的 OfferFlow 邮箱",
    }));
  });
});
