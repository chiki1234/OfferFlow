import Link from "next/link";
import { BriefcaseBusiness, CalendarDays, CircleHelp, LayoutDashboard, Plus } from "lucide-react";

const navigation = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/jobs", label: "求职", icon: BriefcaseBusiness },
  { href: "/calendar", label: "日历", icon: CalendarDays },
  { href: "/faq", label: "FAQ", icon: CircleHelp },
];

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">轨</span>
          <span>
            <strong>求职轨迹</strong>
            <small>Job Flow</small>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="一级导航">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>一次记录，处处同步</strong>
          <p>岗位、日历和面试知识共享同一份上下文。</p>
        </div>
      </aside>
      <div className="workspace-content">{children}</div>
      <Link className="floating-add" href="/jobs?create=1" aria-label="新增待投递">
        <Plus size={24} />
      </Link>
      <nav className="mobile-nav" aria-label="移动端一级导航">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link href={href} key={href}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
