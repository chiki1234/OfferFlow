"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { CompanyJobSearch } from "@/components/company-job-search";
import type { CalendarItem } from "@/modules/workspace-queries/interface";
import { calendarRange, itemsForDay, shanghaiDay, shiftDay } from "@/modules/workspace-queries/calendar-range";

export function CalendarView({ range, items, mode, today }: { range: ReturnType<typeof calendarRange>; items: CalendarItem[]; mode: "week" | "month"; today: string }) {
  const todayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const showingCurrentPeriod = mode === "month"
    ? range.selected.slice(0, 7) === today.slice(0, 7)
    : today >= range.first && today < shiftDay(range.first, range.days);

  const scrollToToday = useCallback(() => {
    const day = todayRef.current;
    const container = scrollRef.current;
    if (!day || !container) return;
    const dayRect = day.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    container.scrollTo({
      left: container.scrollLeft + dayRect.left - containerRect.left - (container.clientWidth - dayRect.width) / 2,
      behavior: "instant",
    });
    window.scrollTo({ top: window.scrollY + dayRect.top - 24, behavior: "instant" });
  }, []);

  useEffect(() => {
    if (!showingCurrentPeriod) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(scrollToToday);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, range.selected, showingCurrentPeriod, today, scrollToToday]);

  const currentWeek = calendarRange(new Date(`${today}T12:00:00+08:00`), today, "week");
  const url = (date: string, view = mode) => `/calendar?view=${view}&date=${date}`;
  return <>
    <div className="calendar-toolbar">
      <div className="section-actions">
        <Link className="secondary-button" href={url(range.previous)}>← 上一{mode === "week" ? "周" : "月"}</Link>
        <strong>{range.label}</strong>
        <Link className="secondary-button" href={url(range.next)}>下一{mode === "week" ? "周" : "月"} →</Link>
        <Link className="secondary-button" href={`${url(today)}#calendar-today`} onNavigate={(event) => {
          if (range.selected === today) {
            event.preventDefault();
            scrollToToday();
          }
        }}>今天</Link>
      </div>
      <CompanyJobSearch />
      <nav className="tab-list" aria-label="日历视图">
        <Link className={mode === "week" ? "active" : ""} aria-current={mode === "week" ? "page" : undefined} href={url(range.selected, "week")}>周</Link>
        <Link className={mode === "month" ? "active" : ""} aria-current={mode === "month" ? "page" : undefined} href={url(range.selected, "month")}>月</Link>
      </nav>
    </div>
    <div ref={scrollRef} className="calendar-scroll" role="region" aria-label="日历日期网格" tabIndex={0}>
      <section className={`surface-card calendar-grid ${mode}`} aria-label={mode === "week" ? "周日历" : "月日历"}>
        {["一", "二", "三", "四", "五", "六", "日"].map(day => <div className="calendar-weekday" key={day}>周{day}</div>)}
        {Array.from({ length: range.days }, (_, index) => {
          const day = shiftDay(range.first, index);
          const dayItems = itemsForDay(items, day).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
          const inCurrentWeek = day >= currentWeek.first && day < shiftDay(currentWeek.first, 7);
          return <div key={day} ref={day === today ? todayRef : undefined} id={day === today ? "calendar-today" : undefined} className={`calendar-day${inCurrentWeek ? " current-week" : ""}${day === today ? " today" : ""}${mode === "month" && day.slice(0, 7) !== range.selected.slice(0, 7) ? " outside" : ""}`} aria-label={`${day}，${dayItems.length} 项事项`}>
            <time className="calendar-date" dateTime={day} aria-current={day === today ? "date" : undefined}>{Number(day.slice(-2))}</time>
            <div className="calendar-day-events">{dayItems.map(item => {
              const time = eventTime(item, day);
              const company = item.companyName ?? "通用待办";
              const role = item.roleName ?? (item.sourceType === "interview" ? "未填写岗位" : item.title);
              return <Link className="calendar-event-card" key={`${item.sourceType}-${item.id}`} prefetch={false}
                href={item.sourceType === "interview" ? `/interviews/${item.id}` : item.jobTrackId ? `/jobs/${item.jobTrackId}#${item.sourceType}-${item.id}` : "/quick"}
                title={`${time}\n${company}${item.department ? ` · ${item.department}` : ""}\n${role}\n${item.title}${item.hasConflict ? "\n时间冲突" : ""}`}>
                {item.hasConflict && <span className="calendar-conflict">冲突</span>}
                <span className="calendar-event-time">{time}</span>
                <span className="calendar-event-heading">
                  <span className={`calendar-event-badge ${item.sourceType}`} title={item.title}>{item.title}</span>
                  <strong className="calendar-event-company" title={company}>{company}</strong>
                </span>
                <span className="calendar-event-role" title={role}>{role}</span>
              </Link>;
            })}</div>
          </div>;
        })}
      </section>
    </div>
  </>;
}

const clockFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function eventTime(item: CalendarItem, day: string) {
  const clock = (value: string) => `${shanghaiDay(value) !== day ? `${Number(shanghaiDay(value).slice(5, 7))}/${Number(shanghaiDay(value).slice(8))} ` : ""}${clockFormat.format(new Date(value))}`;
  return `${item.isDeadline ? "截止 " : ""}${clock(item.startAt)}${item.endAt ? `–${clock(item.endAt)}` : ""}`;
}
