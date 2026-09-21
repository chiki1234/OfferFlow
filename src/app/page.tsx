import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
import { getDatabaseRuntime } from "@/db/runtime";
import { jobTracks, users } from "@/db/schema";
import { Dashboard } from "./dashboard";
import { completeDashboardItemAction } from "./dashboard-actions";
import {
  createQuickTaskAction,
  recordQuickProgressAction,
} from "./quick/actions";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await getCurrentActor();
  const storedDays = Number((await cookies()).get(`attention-days-${encodeURIComponent(actor.userId)}`)?.value ?? 5);
  const waitingDays = Number.isInteger(storedDays) && storedDays >= 1 && storedDays <= 365 ? storedDays : 5;
  const now = new Date().toISOString();
  const [view, profile, taskJobs] = await Promise.all([
    getWorkspaceQueries().read({ type: "get_dashboard", now, waitingDays }, actor),
    getDatabaseRuntime()
      .db.select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1),
    getDatabaseRuntime()
      .db.select({
        id: jobTracks.id,
        companyName: jobTracks.companyName, department: jobTracks.department,
        roleName: jobTracks.roleName,
      })
      .from(jobTracks)
      .where(
        and(
          eq(jobTracks.userId, actor.userId),
          eq(jobTracks.lifecycle, "active"),
        ),
      )
      .orderBy(jobTracks.companyName, jobTracks.roleName),
  ]);
  return (
    <Dashboard
      waitingDays={waitingDays}
      view={view}
      displayName={profile[0]?.name.trim() || "求职者"}
      now={now}
      completeAction={completeDashboardItemAction}
      progressAction={recordQuickProgressAction}
      createTaskAction={createQuickTaskAction}
      taskJobs={taskJobs}
    />
  );
}
