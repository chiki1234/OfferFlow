import type { Metadata } from "next";
import { RegisterForm } from "@/app/account-forms";
import { AccountShell } from "@/app/account-shell";

export const metadata: Metadata = {
  title: "注册｜OfferFlow",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AccountShell eyebrow="开始你的求职旅程" title="创建你的账号" description="注册一个私密工作台，清晰管理每一次求职推进。">
      <RegisterForm />
    </AccountShell>
  );
}
