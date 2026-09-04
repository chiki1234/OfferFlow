"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/auth-client";

export function accountErrorMessage(
  error: { code?: string; status?: number },
  fallback: string,
) {
  if (error.status === 429 || error.code === "TOO_MANY_REQUESTS") {
    return "操作太频繁，请稍后再试。";
  }
  if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
    return "密码长度需要为 10～128 位。";
  }
  if (error.code === "INVALID_EMAIL") return "请输入有效的邮箱地址。";
  if (error.code === "INVALID_NAME") return "请填写 1～255 字的姓名或称呼。";
  if (error.code === "EMAIL_SERVICE_UNAVAILABLE") return "账号邮件服务尚未就绪，请稍后再试。";
  if (error.status && error.status >= 500) return "服务暂时不可用，请稍后重试。";
  return fallback;
}

export function AccountPasswordField({
  name,
  label,
  autoComplete = "new-password",
}: {
  name: string;
  label: string;
  autoComplete?: "new-password" | "current-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      <span>{label}</span>
      <div className="password-field">
        <input
          autoComplete={autoComplete}
          maxLength={128}
          minLength={10}
          name={name}
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? `隐藏${label}` : `显示${label}`}
          aria-pressed={visible}
          className="password-visibility-button"
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          {visible ? <Eye aria-hidden="true" size={18} /> : <EyeOff aria-hidden="true" size={18} />}
        </button>
      </div>
    </label>
  );
}

export function VerificationResend({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function resend() {
    setPending(true);
    setError(null);
    setSent(false);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/login?verified=1",
      });
      if (result.error) {
        setError(accountErrorMessage(result.error, "暂时无法发送验证邮件，请稍后再试。"));
        return;
      }
      setSent(true);
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="account-resend">
      <button className="secondary-button" disabled={pending} onClick={resend} type="button">
        {pending ? "正在发送…" : "重新发送验证邮件"}
      </button>
      {sent && <p className="form-success" role="status">如果该邮箱仍待验证，我们会发送新的验证邮件。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export function RegisterForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!name) {
      setError("请填写你的姓名或称呼。");
      return;
    }
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("两次输入的密码不一致，请重新输入。");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/login?verified=1",
      });
      if (result.error) {
        setError(accountErrorMessage(result.error, "暂时无法注册，请检查填写内容后重试。"));
        return;
      }
      setRegisteredEmail(email);
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (registeredEmail) {
    return (
      <div className="account-result" role="status">
        <h3>请查收验证邮件</h3>
        <p>请检查 <strong>{registeredEmail}</strong> 的收件箱和垃圾邮件，打开验证链接后即可登录。</p>
        <p>如果这个邮箱已经注册，可以直接登录或找回密码。</p>
        <VerificationResend email={registeredEmail} />
        <Link className="primary-button wide" href="/login">返回登录</Link>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label><span>姓名或称呼</span><input autoComplete="name" maxLength={255} name="name" required /></label>
      <label><span>邮箱</span><input autoComplete="email" maxLength={320} name="email" placeholder="name@example.com" required type="email" /></label>
      <AccountPasswordField label="密码" name="password" />
      <AccountPasswordField label="确认密码" name="confirmPassword" />
      <p className="form-hint">密码为 10～128 位。注册后需要验证邮箱。</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" disabled={pending} type="submit">{pending ? "正在注册…" : "注册账号"}</button>
      <p className="account-switch">已有账号？<Link href="/login">去登录</Link></p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (result.error) {
        setError(accountErrorMessage(result.error, "暂时无法发送重设密码邮件，请稍后重试。"));
        return;
      }
      setSent(true);
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="account-result" role="status">
        <h3>请检查你的邮箱</h3>
        <p>如果该邮箱已注册，我们会发送重设密码邮件。请同时检查垃圾邮件，链接在一小时内有效。</p>
        <Link className="primary-button wide" href="/login">返回登录</Link>
        <button className="secondary-button" onClick={() => setSent(false)} type="button">重新填写邮箱</button>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label><span>注册邮箱</span><input autoComplete="email" maxLength={320} name="email" placeholder="name@example.com" required type="email" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" disabled={pending} type="submit">{pending ? "正在发送…" : "发送重设密码邮件"}</button>
      <p className="account-switch"><Link href="/login">返回登录</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [changed, setChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("两次输入的密码不一致，请重新输入。");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") setInvalid(true);
        else setError(accountErrorMessage(result.error, "暂时无法重设密码，请稍后重试。"));
        return;
      }
      setChanged(true);
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (invalid) {
    return (
      <div className="account-result" role="alert">
        <h3>重设密码链接已失效</h3>
        <p>链接可能已过期或已经使用，请重新申请一封邮件。</p>
        <Link className="primary-button wide" href="/forgot-password">重新申请重设密码</Link>
        <Link className="secondary-button" href="/login">返回登录</Link>
      </div>
    );
  }

  if (changed) {
    return (
      <div className="account-result" role="status">
        <h3>密码已更新</h3>
        <p>请使用新密码登录。其他设备上的旧登录状态已退出。</p>
        <Link className="primary-button wide" href="/login">去登录</Link>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <AccountPasswordField label="新密码" name="password" />
      <AccountPasswordField label="确认新密码" name="confirmPassword" />
      <p className="form-hint">密码为 10～128 位。</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" disabled={pending} type="submit">{pending ? "正在保存…" : "保存新密码"}</button>
    </form>
  );
}
