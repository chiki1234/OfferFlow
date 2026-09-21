"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

export function JobsSearch({ query, tab, counts }: { query: string; tab: string; counts: { planned: number; active: number; ended: number } }) {
  const router = useRouter();
  const [editing, setEditing] = useState({ source: query, value: query });
  const draft = editing.source === query ? editing.value : query;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.replace(`/jobs?${new URLSearchParams({ tab, ...(q ? { q } : {}) })}`, { scroll: false }), 200);
  };
  useEffect(() => { if (input.current && document.activeElement !== input.current) input.current.value = query; }, [query]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [tab]);
  return <><nav className="tab-list" aria-label="岗位生命周期">{([{ key: "planned", label: "待投递" }, { key: "active", label: "进行中" }, { key: "ended", label: "已结束" }] as const).map(item => <Link key={item.key} className={tab === item.key ? "active" : undefined} href={`/jobs?${new URLSearchParams({ tab: item.key, ...(draft ? { q: draft } : {}) })}`} onClick={() => { if (timer.current) clearTimeout(timer.current); }}>{item.label}<span>{counts[item.key]}</span></Link>)}</nav><label className="jobs-search"><Search size={17} aria-hidden="true" />
    <input ref={input} aria-label="搜索公司名称或岗位名称" type="search" placeholder="搜索公司 / 岗位" defaultValue={query} onCompositionStart={() => {
      composing.current = true;
      if (timer.current) clearTimeout(timer.current);
    }} onCompositionEnd={event => { composing.current = false; search(event.currentTarget.value); }} onChange={event => {
      setEditing({ source: query, value: event.target.value });
      if (!composing.current) search(event.target.value);
    }} />
  </label></>;
}
