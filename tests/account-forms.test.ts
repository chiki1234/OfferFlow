// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm, RegisterForm, ResetPasswordForm } from "@/app/account-forms";
import { LoginForm } from "@/app/login/login-form";

const { signUp, signIn, sendVerification, requestReset, resetPassword } = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  sendVerification: vi.fn(),
  requestReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("@/auth-client", () => ({
  authClient: {
    signUp: { email: signUp },
    signIn: { email: signIn },
    sendVerificationEmail: sendVerification,
    requestPasswordReset: requestReset,
    resetPassword,
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  signUp.mockResolvedValue({ data: {}, error: null });
  signIn.mockResolvedValue({ data: {}, error: null });
  sendVerification.mockResolvedValue({ data: {}, error: null });
  requestReset.mockResolvedValue({ data: {}, error: null });
  resetPassword.mockResolvedValue({ data: {}, error: null });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function fill(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  input.value = value;
}

async function submit() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("公开账号页面", () => {
  it("注册密码一致后提交，并显示查收邮件与重发入口", async () => {
    await act(async () => root.render(createElement(RegisterForm)));
    fill("name", " 小明 ");
    fill("email", "new@example.com");
    fill("password", "initial-password");
    fill("confirmPassword", "different-password");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("两次输入的密码不一致");
    expect(signUp).not.toHaveBeenCalled();

    fill("confirmPassword", "initial-password");
    await submit();
    expect(signUp).toHaveBeenCalledWith({
      name: "小明",
      email: "new@example.com",
      password: "initial-password",
      callbackURL: "/login?verified=1",
    });
    expect(container.textContent).toContain("请查收验证邮件");
    const resend = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重新发送验证邮件");
    expect(resend).toBeDefined();
    await act(async () => resend!.click());
    expect(sendVerification).toHaveBeenCalledWith({
      email: "new@example.com",
      callbackURL: "/login?verified=1",
    });
  });

  it("找回密码提交邮箱后显示不泄露账号存在性的统一提示", async () => {
    await act(async () => root.render(createElement(ForgotPasswordForm)));
    fill("email", "existing@example.com");
    await submit();
    expect(requestReset).toHaveBeenCalledWith({
      email: "existing@example.com",
      redirectTo: "/reset-password",
    });
    expect(container.textContent).toContain("如果该邮箱已注册");
    expect(container.textContent).toContain("重设密码邮件");
  });

  it("重设密码使用邮件令牌，并为失效链接提供重新申请入口", async () => {
    await act(async () => root.render(createElement(ResetPasswordForm, { token: "reset-token" })));
    fill("password", "changed-password");
    fill("confirmPassword", "changed-password");
    resetPassword.mockResolvedValueOnce({ data: null, error: { code: "INVALID_TOKEN", status: 400 } });
    await submit();
    expect(resetPassword).toHaveBeenCalledWith({ token: "reset-token", newPassword: "changed-password" });
    expect(container.textContent).toContain("链接已失效");
    expect(container.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });

  it("未验证账号登录时明确说明原因，并允许重发验证邮件", async () => {
    signIn.mockResolvedValueOnce({ data: null, error: { code: "EMAIL_NOT_VERIFIED", status: 403 } });
    await act(async () => root.render(createElement(LoginForm, { destination: "/" })));
    fill("email", "new@example.com");
    fill("password", "initial-password");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("请先验证邮箱");
    expect(container.querySelector('a[href="/register"]')).not.toBeNull();
    expect(container.querySelector('a[href="/forgot-password"]')).not.toBeNull();
    const resend = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重新发送验证邮件");
    expect(resend).toBeDefined();
  });

  it("注册网络失败后恢复按钮并保留填写内容", async () => {
    signUp.mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.render(createElement(RegisterForm)));
    fill("name", "小明");
    fill("email", "new@example.com");
    fill("password", "initial-password");
    fill("confirmPassword", "initial-password");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("网络连接失败");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(container.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("new@example.com");
  });
});
