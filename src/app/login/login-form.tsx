"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/auth-client";
import { AccountPasswordField, VerificationResend, accountErrorMessage } from "@/app/account-forms";

export function LoginForm({ destination }: { destination: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setVerificationEmail(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    try {
      const result = await authClient.signIn.email({
        email,
        password: String(form.get("password") ?? ""),
        rememberMe: true,
      });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setError("请先验证邮箱。检查收件箱和垃圾邮件，打开验证链接后再登录。");
          setVerificationEmail(email);
        } else {
          setError(accountErrorMessage(result.error, "账号或密码不正确，请重新输入。"));
        }
        return;
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>邮箱账号</span>
        <input autoComplete="email" maxLength={320} name="email" placeholder="name@example.com" required type="email" />
      </label>
      <AccountPasswordField autoComplete="current-password" label="密码" name="password" />
      <div className="account-links"><Link href="/forgot-password">忘记密码？</Link></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {verificationEmail && <VerificationResend email={verificationEmail} />}
      <button className="primary-button wide" disabled={pending} type="submit">
        {pending ? "正在登录…" : "登录"}
      </button>
      <p className="account-switch">还没有账号？<Link href="/register">注册账号</Link></p>
    </form>
  );
}
