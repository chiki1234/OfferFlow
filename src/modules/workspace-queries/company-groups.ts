import type { JobTrackListItem } from "./interface";

export function groupCompanyJobs(jobs: JobTrackListItem[]) {
  const map = new Map<string, JobTrackListItem[]>();
  for (const job of jobs) { const key = job.companyName.trim().toLowerCase(); map.set(key, [...(map.get(key) ?? []), job]); }
  return [...map.values()].map(items => ({ name: items[0].companyName, actionRequired: items.some(item => item.actionState === "action_required"), items: items.sort((a,b) => (a.preferenceRank ?? Infinity) - (b.preferenceRank ?? Infinity) || a.roleName.localeCompare(b.roleName, "zh-CN")) }));
}
export function preferenceLabel(rank: number) {
  const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const label = rank < 10 ? digits[rank] : rank < 100 ? `${rank < 20 ? "" : digits[Math.floor(rank / 10)]}十${digits[rank % 10]}` : String(rank);
  return `${label}志愿`;
}
