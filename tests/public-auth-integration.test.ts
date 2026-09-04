import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccountEmailDelivery } from "@/adapters/email/account-email";
import { getDatabaseRuntime } from "@/db/runtime";
import { users } from "@/db/schema";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";

config({ path: [".env.local", ".env"], quiet: true });

describe.skipIf(process.env.PUBLIC_AUTH_INTEGRATION !== "1")("公开账号完整流程", () => {
  const email = `public-auth-${randomUUID()}@example.com`;
  const secondEmail = `public-auth-${randomUUID()}@example.com`;
  const deliveries: AccountEmailDelivery[] = [];
  let auth: { handler(request: Request): Promise<Response> };

  beforeAll(async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("AUTH_SECRET", "public-auth-integration-secret-for-tests-only");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("SMTP_PASSWORD", "mail-secret");
    vi.stubEnv("SMTP_FROM", "OfferFlow <no-reply@example.com>");
    const { createOfferFlowAuth } = await import("@/auth");
    auth = createOfferFlowAuth(async (message) => {
      deliveries.push(message);
    });
  });

  afterAll(async () => {
    await getDatabaseRuntime().db.delete(users).where(inArray(users.email, [email, secondEmail]));
    await getDatabaseRuntime().close();
    vi.unstubAllEnvs();
  });

  async function post(path: string, body: Record<string, unknown>) {
    return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }));
  }

  it("用户验证邮箱后才能登录，并能通过邮件重设密码", async () => {
    const registered = await post("/sign-up/email", {
      name: "公开注册验收",
      email,
      password: "initial-password",
      callbackURL: "/login?verified=1",
    });
    expect(registered.status).toBe(200);
    expect(registered.headers.get("set-cookie")).toBeNull();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ kind: "verification", to: email });

    const duplicate = await post("/sign-up/email", {
      name: "重复注册",
      email,
      password: "initial-password",
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.headers.get("set-cookie")).toBeNull();

    const blocked = await post("/sign-in/email", {
      email,
      password: "initial-password",
    });
    expect(blocked.status).toBe(403);

    const verified = await auth.handler(new Request(deliveries[0].url, { redirect: "manual" }));
    expect(verified.status).toBeGreaterThanOrEqual(300);
    expect(verified.status).toBeLessThan(400);
    expect(verified.headers.get("location")).toContain("/login?verified=1");

    const signedIn = await post("/sign-in/email", {
      email,
      password: "initial-password",
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("set-cookie")).toContain("better-auth.session_token");
    const sessionCookie = signedIn.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");

    const resetRequested = await post("/request-password-reset", {
      email,
      redirectTo: "/reset-password",
    });
    expect(resetRequested.status).toBe(200);
    const resetMail = deliveries.find((message) => message.kind === "password-reset");
    expect(resetMail).toBeDefined();

    const resetCallback = await auth.handler(new Request(resetMail!.url, { redirect: "manual" }));
    const resetLocation = resetCallback.headers.get("location");
    expect(resetLocation).toContain("/reset-password?token=");
    const token = new URL(resetLocation!).searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await post("/reset-password", {
      token,
      newPassword: "changed-password",
    });
    expect(reset.status).toBe(200);

    const oldSession = await auth.handler(new Request("http://localhost:3000/api/auth/get-session", {
      headers: { cookie: sessionCookie },
    }));
    expect(await oldSession.json()).toBeNull();
    const reusedReset = await post("/reset-password", { token, newPassword: "another-password" });
    expect(reusedReset.status).toBe(400);

    const oldPassword = await post("/sign-in/email", {
      email,
      password: "initial-password",
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await post("/sign-in/email", {
      email,
      password: "changed-password",
    });
    expect(newPassword.status).toBe(200);
    const firstUser = (await newPassword.json()).user as { id: string };

    await post("/sign-up/email", { name: "第二位用户", email: secondEmail, password: "second-password" });
    const secondVerification = deliveries.find((message) => message.to === secondEmail)!;
    await auth.handler(new Request(secondVerification.url));
    const secondLogin = await post("/sign-in/email", { email: secondEmail, password: "second-password" });
    expect(secondLogin.status).toBe(200);
    const secondUser = (await secondLogin.json()).user as { id: string };
    expect(firstUser.id).not.toBe(secondUser.id);

    const task = await getJobWorkflow().execute({
      type: "create_task",
      idempotencyKey: randomUUID(),
      kind: "generic",
      title: "公开注册隔离验收",
      deadlineAt: new Date().toISOString(),
    }, { userId: firstUser.id });
    const firstDashboard = await getWorkspaceQueries().read({ type: "get_dashboard" }, { userId: firstUser.id });
    const secondDashboard = await getWorkspaceQueries().read({ type: "get_dashboard" }, { userId: secondUser.id });
    expect(firstDashboard.todayItems.some((item) => item.id === task.task.id)).toBe(true);
    expect(secondDashboard.todayItems.some((item) => item.id === task.task.id)).toBe(false);
  }, 15_000);

  it("无效和过期链接不能完成验证或重置", async () => {
    const invalidVerification = await auth.handler(new Request("http://localhost:3000/api/auth/verify-email?token=invalid&callbackURL=/login"));
    expect(invalidVerification.headers.get("location")).toContain("error=");
    const { createEmailVerificationToken } = await import("better-auth/api");
    const expiredToken = await createEmailVerificationToken(process.env.AUTH_SECRET!, email, undefined, -1);
    const expiredVerification = await auth.handler(new Request(`http://localhost:3000/api/auth/verify-email?token=${expiredToken}&callbackURL=/login`));
    expect(expiredVerification.headers.get("location")).toContain("error=");
    const invalidReset = await post("/reset-password", { token: "invalid", newPassword: "changed-password" });
    expect(invalidReset.status).toBe(400);

    await post("/request-password-reset", { email, redirectTo: "/reset-password" });
    const resetMail = deliveries.filter((message) => message.kind === "password-reset").at(-1)!;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    try {
      const expiredReset = await auth.handler(new Request(resetMail.url));
      expect(expiredReset.headers.get("location")).toContain("error=INVALID_TOKEN");
    } finally {
      vi.useRealTimers();
    }
  });

  it("邮件服务缺失时拒绝注册，且不泄露配置值", async () => {
    vi.stubEnv("SMTP_HOST", "");
    try {
      const unavailable = await post("/sign-up/email", { name: "测试", email, password: "initial-password" });
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toMatchObject({ code: "EMAIL_SERVICE_UNAVAILABLE" });
    } finally {
      vi.stubEnv("SMTP_HOST", "smtp.example.com");
    }
  });

  it("生产环境限制同一来源重复发送验证邮件", async () => {
    const previousEnvironment = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    try {
      const { createOfferFlowAuth } = await import("@/auth");
      const limitedAuth = createOfferFlowAuth(async () => undefined);
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await limitedAuth.handler(new Request("http://localhost:3000/api/auth/send-verification-email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "198.51.100.10" },
          body: JSON.stringify({ email, callbackURL: "/login?verified=1" }),
        }));
        statuses.push(response.status);
      }
      expect(statuses).toEqual([200, 200, 200, 429]);
    } finally {
      vi.stubEnv("NODE_ENV", previousEnvironment);
    }
  });
});
