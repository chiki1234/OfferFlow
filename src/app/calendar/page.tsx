import { CalendarDays } from "lucide-react";

export default function CalendarPage() {
  return (
    <main className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">周视图</p>
          <h1>所有硬时间，一个地方看清。</h1>
          <p className="page-description">面试、固定笔试和 Deadline 会直接从业务对象汇总到这里。</p>
        </div>
      </header>
      <section className="surface-card empty-state jobs-empty" style={{ marginTop: 40 }}>
        <span className="empty-icon"><CalendarDays size={22} /></span>
        <div><strong>还没有日历事项</strong><p>记录第一场面试或测评后，周视图会自动出现。</p></div>
      </section>
    </main>
  );
}
