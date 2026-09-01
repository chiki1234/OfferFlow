import type { DashboardActionItem } from "./interface";

export function sortDashboardActionItems(items: DashboardActionItem[]) {
  return [...items].sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    return left.dueAt.localeCompare(right.dueAt);
  });
}
