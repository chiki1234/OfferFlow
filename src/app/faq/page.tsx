import { CircleHelp } from "lucide-react";

export default function FaqPage() {
  return (
    <main className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">面试知识</p>
          <h1>让每一场面试，为下一场积累。</h1>
          <p className="page-description">FAQ 会按经历沉淀，并始终保留来源面试。</p>
        </div>
      </header>
      <section className="surface-card empty-state jobs-empty" style={{ marginTop: 40 }}>
        <span className="empty-icon"><CircleHelp size={22} /></span>
        <div><strong>知识库还没有问题</strong><p>完成面试后，可以一次粘贴多个 FAQ Block。</p></div>
      </section>
    </main>
  );
}
