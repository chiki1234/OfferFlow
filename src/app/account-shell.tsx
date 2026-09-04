import Image from "next/image";
import type { ReactNode } from "react";
import offerFlowIcon from "@/app/icon.png";

export function AccountShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-brand"><span className="brand-mark"><Image alt="" className="brand-mark-image" fill priority sizes="38px" src={offerFlowIcon} /></span><strong>OfferFlow</strong></div>
        <p className="eyebrow">Offer Flow</p>
        <h1>把每一次投递，<br />变成清晰的下一步。</h1>
        <p>岗位、日历、面试复盘与经验沉淀，都在一个私密工作台中衔接起来。</p>
      </section>
      <section className="login-panel">
        <div className="surface-card login-card">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
