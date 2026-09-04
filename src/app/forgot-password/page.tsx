import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/app/account-forms";
import { AccountShell } from "@/app/account-shell";

export const metadata: Metadata = {
  title: "找回密码｜OfferFlow",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AccountShell eyebrow="找回账号" title="忘记密码了？" description="填写注册邮箱，我们会发送重设密码的链接。">
      <ForgotPasswordForm />
    </AccountShell>
  );
}
