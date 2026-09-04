import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { AccountShell } from "@/app/account-shell";
import { getLoginDestination } from "@/shared/actor/login-destination";

export const metadata: Metadata = {
  title: "登录｜OfferFlow",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; verified?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const destination = getLoginDestination(params.next);

  return (
    <AccountShell eyebrow="欢迎回来" title="登录你的工作台" description="使用已验证的邮箱和密码登录。">
      {params.error ? (
        <p className="form-error account-notice" role="alert">邮箱验证链接已失效。请填写邮箱和密码，再重新发送验证邮件。</p>
      ) : params.verified === "1" ? (
        <p className="form-success account-notice" role="status">邮箱验证成功，现在可以登录了。</p>
      ) : null}
      <LoginForm destination={destination} />
    </AccountShell>
  );
}
