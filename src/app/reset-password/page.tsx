import type { Metadata } from "next";
import { ResetPasswordForm } from "@/app/account-forms";
import { AccountShell } from "@/app/account-shell";

export const metadata: Metadata = {
  title: "重设密码｜OfferFlow",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = !params.error && typeof params.token === "string" ? params.token : undefined;
  return (
    <AccountShell eyebrow="账号安全" title="设置新密码" description="更新密码后，请在各设备上重新登录。">
      <ResetPasswordForm token={token} />
    </AccountShell>
  );
}
