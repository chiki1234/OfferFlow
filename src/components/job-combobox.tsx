"use client";

import { useId, useState } from "react";

export function JobCombobox({ jobs }: { jobs: Array<{ id: string; companyName: string; department?: string | null; roleName: string }> }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = jobs.filter(job => `${job.companyName} ${job.department ?? ""} ${job.roleName}`.toLowerCase().includes(query.trim().toLowerCase()));
  function choose(job: typeof jobs[number]) { setSelected(job.id); setQuery(`${job.companyName}${job.department ? ` · ${job.department}` : ""} · ${job.roleName}`); setOpen(false); }
  const visible = selected ? jobs : matches;
  return <div className="job-combobox" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>岗位</label><input type="hidden" name="jobTrackId" value={selected} />
    <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={open && visible[active] ? `${id}-${active}` : undefined} autoComplete="off" required value={query} placeholder="搜索公司或岗位" onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setSelected(""); setActive(0); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(visible.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && open) { event.preventDefault(); if (visible[active]) choose(visible[active]); }
    }} />
    {open && <div className="job-options" id={`${id}-options`} role="listbox" aria-label="匹配的岗位">{visible.map((job, index) => <div id={`${id}-${index}`} role="option" aria-selected={job.id === selected} className={index === active ? "highlighted" : ""} key={job.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(job)}>{job.companyName}{job.department ? ` · ${job.department}` : ""} · {job.roleName}</div>)}{!visible.length && <p>没有匹配的进行中岗位</p>}</div>}
    {!selected && query && <small className="form-hint">请从下拉列表选择岗位</small>}
  </div>;
}
