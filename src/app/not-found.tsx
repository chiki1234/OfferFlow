import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFoundPage() {
  return <main className="system-state-page">
    <div className="surface-card system-state-card">
      <span className="system-state-icon"><SearchX size={26} /></span>
      <p className="eyebrow">没有找到</p>
      <h1>这条记录不存在或已被删除</h1>
      <p>返回求职列表继续查看其他岗位；如果你刚刚删除了它，这正是预期结果。</p>
      <Link className="primary-button" href="/jobs"><ArrowLeft size={16} />返回求职列表</Link>
    </div>
  </main>;
}
