"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/auth-client";

export function LoginForm({ destination }: { destination: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      rememberMe: true,
    });
    if (result.error) {
      setError("账号或密码不正确，请重新输入。");
      setPending(false);
      return;
    }
    router.replace(destination);
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>邮箱账号</span>
        <input autoComplete="email" name="email" placeholder="name@example.com" required type="email" />
      </label>
      <label>
        <span>密码</span>
        <div className="password-field">
          <input autoComplete="current-password" minLength={10} name="password" required type={showPassword ? "text" : "password"} />
          <button
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword}
            className="password-visibility-button"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <Eye aria-hidden="true" size={18} /> : <EyeOff aria-hidden="true" size={18} />}
          </button>
        </div>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" disabled={pending} type="submit">
        {pending ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
