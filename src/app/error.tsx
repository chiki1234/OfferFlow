"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="system-state-page">
    <div className="surface-card system-state-card">
      <span className="system-state-icon error"><TriangleAlert size={26} /></span>
      <p className="eyebrow">暂时无法加载</p>
      <h1>服务遇到了一点问题</h1>
      <p>你的数据没有被修改。可以先重试；如果服务尚未启动，请检查数据库与对象存储。</p>
      <div className="system-state-actions"><button className="primary-button" onClick={reset} type="button"><RotateCcw size={16} />重新加载</button><Link className="secondary-button" href="/">返回工作台</Link></div>
    </div>
  </main>;
}
