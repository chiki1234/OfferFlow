"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen, BriefcaseBusiness, CalendarDays, Download, House, Sprout } from "lucide-react";
import { usePathname } from "next/navigation";
import offerFlowIcon from "@/app/icon.png";
import { LogoutButton } from "@/components/logout-button";
import { GlobalQuickActions } from "@/components/global-quick-actions";

const navigation = [
  { href: "/", label: "工作台", icon: House },
  { href: "/jobs", label: "求职", icon: BriefcaseBusiness },
  { href: "/calendar", label: "日历", icon: CalendarDays },
  { href: "/faq", label: "知识库", icon: BookOpen },
];

function isNavigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/jobs") return pathname.startsWith("/jobs") || pathname.startsWith("/interviews");
  if (href === "/faq") return pathname.startsWith("/faq") || pathname.startsWith("/experiences");
  return pathname.startsWith(href);
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (["/login", "/register", "/forgot-password", "/reset-password"].includes(pathname)) return <>{children}</>;

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><Image alt="" className="brand-mark-image" fill priority sizes="38px" src={offerFlowIcon} /></span>
          <span>
            <strong>OfferFlow</strong>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="一级导航">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link aria-current={isNavigationActive(pathname, href) ? "page" : undefined} className={isNavigationActive(pathname, href) ? "active" : undefined} href={href} key={href}>
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note-symbol" aria-hidden="true"><Sprout size={30} strokeWidth={1.5} /></span>
          <strong>一次记录，处处同步</strong>
          <p>岗位、日历和面试知识共享同一份上下文。</p>
          <a href="/api/export"><Download size={14} />导出我的数据</a>
        </div>
        <LogoutButton />
      </aside>
      <div className="workspace-content">{children}</div>
      <GlobalQuickActions />
      <nav className="mobile-nav" aria-label="移动端一级导航">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link aria-current={isNavigationActive(pathname, href) ? "page" : undefined} className={isNavigationActive(pathname, href) ? "active" : undefined} href={href} key={href}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
        <LogoutButton compact />
      </nav>
    </div>
  );
}
