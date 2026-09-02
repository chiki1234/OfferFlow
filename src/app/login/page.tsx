import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "登录｜求职轨迹",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-brand"><span className="brand-mark">轨</span><strong>求职轨迹</strong></div>
        <p className="eyebrow">Job Flow</p>
        <h1>把每一次投递，<br />变成清晰的下一步。</h1>
        <p>岗位、日历、面试复盘与经验沉淀，都在一个私密工作台中衔接起来。</p>
      </section>
      <section className="login-panel">
        <div className="surface-card login-card">
          <p className="eyebrow">欢迎回来</p>
          <h2>登录你的工作台</h2>
          <p>使用管理员为你创建的账号和密码。</p>
          <LoginForm destination={destination} />
        </div>
      </section>
    </main>
  );
}
