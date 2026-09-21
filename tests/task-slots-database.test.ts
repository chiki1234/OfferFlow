import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDatabaseRuntime } from "@/db/runtime";
import { assets, resumes, users } from "@/db/schema";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
describe.skipIf(process.env.COMPANY_INTEGRATION !== "1")("待办时段、工作台边界与岗位编辑数据库验收", () => {
  const actor = { userId: randomUUID() };
  const now = "2026-09-09T04:00:00.000Z";
  beforeAll(async () => {
    config({ path: [".env.local", ".env"], quiet: true });
    vi.stubEnv("AUTH_MODE", "local"); vi.stubEnv("APP_USER_ID", actor.userId);
    await getDatabaseRuntime().db.insert(users).values({ id: actor.userId, name: "时段隔离验收", email: `${actor.userId}@example.invalid` });
  });
  afterAll(async () => { await getDatabaseRuntime().db.delete(users).where(eq(users.id, actor.userId)); await getDatabaseRuntime().close(); vi.unstubAllEnvs(); });
  it("今日/逾期/无日期/未来分区正确，固定时段参与冲突且结束后才逾期", async () => {
    const workflow = getJobWorkflow(); const query = getWorkspaceQueries();
    const times = [
      { title: "逾期", deadlineAt: "2026-09-08T00:00:00Z" },
      { title: "今天", deadlineAt: "2026-09-09T15:59:00Z" },
      { title: "无时间" },
      { title: "未来", deadlineAt: "2026-09-09T16:00:00Z" },
      { title: "七天外", deadlineAt: "2026-09-16T16:00:00Z" },
      { title: "进行中", startAt: "2026-09-09T03:00:00Z", endAt: "2026-09-09T05:00:00Z" },
      { title: "交叉时段", startAt: "2026-09-09T04:30:00Z", endAt: "2026-09-09T06:00:00Z" },
      { title: "跨天", startAt: "2026-09-08T15:00:00Z", endAt: "2026-09-09T06:00:00Z" },
    ];
    for (const time of times) await workflow.execute({ type: "create_task", idempotencyKey: randomUUID(), kind: "generic", ...time }, actor);
    const view = await query.read({ type: "get_dashboard", now }, actor);
    expect(view.todayItems.map(item => item.title)).toEqual(["逾期", "跨天", "进行中", "交叉时段", "今天", "无时间"]);
    expect(view.todayItems.find(item => item.title === "进行中")).toMatchObject({ overdue: false, timeSource: "start" });
    expect(view.upcomingItems.map(item => item.title)).toEqual(["未来"]);
    const calendar = await query.read({ type: "get_calendar_week", startAt: "2026-09-08T16:00:00Z", endAt: "2026-09-09T16:00:00Z" }, actor);
    expect(calendar.items.filter(item => item.hasConflict).map(item => item.title).sort()).toEqual(["交叉时段", "跨天", "进行中"].sort());
    expect(calendar.items.find(item => item.title === "今天")?.hasConflict).toBe(false);
  });
  it("岗位编辑实际保存部门、简历、投递时间和撤回状态，保留招聘记录", async () => {
    const workflow = getJobWorkflow(); const query = getWorkspaceQueries();
    const resumeId = randomUUID(), assetId = randomUUID();
    await getDatabaseRuntime().db.insert(assets).values({ id: assetId, userId: actor.userId, kind: "resume", storageKey: `isolated-test/${assetId}`, originalName: "test.pdf", mimeType: "application/pdf", sizeBytes: 1 });
    await getDatabaseRuntime().db.insert(resumes).values({ id: resumeId, userId: actor.userId, name: "验收简历", assetId });
    const created = await workflow.execute({ type: "create_company_jobs", idempotencyKey: randomUUID(), companyName: "隔离公司", lifecycle: "active", entries: [{ roleName: "岗位", department: "原部门", resumeId, jobDescription: { text: "JD" } }] }, actor);
    const job = created.jobTracks[0];
    await workflow.execute({ type: "record_assessment_invite", idempotencyKey: randomUUID(), jobTrackId: job.id, assessmentKind: "assessment", title: "测评", timing: { type: "deadline", deadlineAt: "2026-09-10T03:00:00Z" }, receivedAt: now }, actor);
    const current = await query.read({ type: "get_job_track_detail", jobTrackId: job.id }, actor);
    const form = new FormData();
    for (const [key, value] of Object.entries({ jobTrackId: job.id, version: String(current.jobTrack.version), idempotencyKey: randomUUID(), companyName: "隔离公司", roleName: "新岗位", department: "新部门", jobDescription: "新JD", jobUrl: "", lifecycle: "active", submittedAt: "2026-09-08T09:30", resumeMode: "existing", resumeId })) form.set(key, value);
    const { saveJobEditorAction } = await import("@/app/jobs/edit-actions");
    expect(await saveJobEditorAction(form)).toEqual({ error: null });
    expect(await saveJobEditorAction(form)).toEqual({ error: null });
    const edited = await query.read({ type: "get_job_track_detail", jobTrackId: job.id }, actor);
    expect(edited.jobTrack).toMatchObject({ department: "新部门", roleName: "新岗位", submittedAt: "2026-09-08T01:30:00.000Z" });
    form.set("idempotencyKey", randomUUID()); form.set("version", String(edited.jobTrack.version)); form.set("lifecycle", "planned");
    expect(await saveJobEditorAction(form)).toEqual({ error: null });
    const reverted = await query.read({ type: "get_job_track_detail", jobTrackId: job.id }, actor);
    expect(reverted.jobTrack).toMatchObject({ lifecycle: "planned", submittedAt: null, department: "新部门" });
    expect(reverted.assessments).toHaveLength(1);
    expect(reverted.selectedResume?.id).toBe(resumeId);
    expect(reverted.events.filter(event => event.kind === "ApplicationCorrected")).toHaveLength(2);
  });
  it("全局新增和编辑均持久化时段并能清空", async () => {
    const { createQuickTaskAction } = await import("@/app/quick/actions");
    const form = new FormData();
    for (const [key, value] of Object.entries({ idempotencyKey: randomUUID(), title: "表单时段", timingType: "fixed_slot", startAt: "2026-09-11T10:00", endAt: "2026-09-11T11:00" })) form.set(key, value);
    expect((await createQuickTaskAction({ error: null, success: null }, form)).error).toBeNull();
    const view = await getWorkspaceQueries().read({ type: "get_dashboard", now }, actor);
    expect(view.upcomingItems.find(item => item.title === "表单时段")).toMatchObject({ startAt: "2026-09-11T02:00:00.000Z", endAt: "2026-09-11T03:00:00.000Z", isDeadline: false });
    const taskId = view.upcomingItems.find(item => item.title === "表单时段")!.id;
    const { editQuickTaskAction } = await import("@/app/quick/actions");
    form.set("taskId", taskId); form.set("idempotencyKey", randomUUID()); form.set("timingType", "none");
    expect((await editQuickTaskAction(form)).error).toBeNull();
    const cleared = await getWorkspaceQueries().read({type:"get_dashboard",now},actor);
    expect(cleared.todayItems.find(item=>item.id===taskId)?.dueAt).toBeNull();
    expect(cleared.upcomingItems.some(item=>item.id===taskId)).toBe(false);

  });
  it("面试 Deadline 可由全局表单保存、进入工作台和日历，并可改为固定时段", async () => {
    const workflow = getJobWorkflow();
    const created = await workflow.execute({
      type: "quick_import_job_tracks",
      idempotencyKey: randomUUID(),
      lifecycle: "active",
      entries: [{ companyName: "面试时段验收", roleName: "产品经理" }],
    }, actor);
    const jobTrackId = created.jobTracks[0].id;
    const form = new FormData();
    for (const [key, value] of Object.entries({
      idempotencyKey: randomUUID(),
      jobTrackId,
      progressType: "interview",
      roundLabel: "Deadline 面试",
      timingType: "deadline",
      deadlineAt: "2026-09-12T18:00",
      receivedAt: "2026-09-09T12:00",
      meetingUrl: "",
    })) form.set(key, value);
    const { recordQuickProgressAction } = await import("@/app/quick/actions");
    expect(await recordQuickProgressAction({ error: null, success: null }, form)).toMatchObject({ error: null });

    const detail = await getWorkspaceQueries().read({ type: "get_job_track_detail", jobTrackId }, actor);
    const interview = detail.interviews.find(item => item.roundLabel === "Deadline 面试")!;
    expect(interview.timing).toEqual({ type: "deadline", deadlineAt: "2026-09-12T10:00:00.000Z" });
    const dashboard = await getWorkspaceQueries().read({ type: "get_dashboard", now: "2026-09-12T10:00:00.001Z" }, actor);
    expect(dashboard.todayItems.find(item => item.id === interview.id && item.sourceType === "interview")).toMatchObject({ dueAt: "2026-09-12T10:00:00.000Z", timeSource: "deadline", overdue: true });
    const calendar = await getWorkspaceQueries().read({ type: "get_calendar_week", startAt: "2026-09-11T16:00:00Z", endAt: "2026-09-12T16:00:00Z" }, actor);
    expect(calendar.items.find(item => item.id === interview.id)).toMatchObject({ startAt: "2026-09-12T10:00:00.000Z", endAt: null, isDeadline: true, hasConflict: false });

    await workflow.execute({
      type: "reschedule_interview",
      idempotencyKey: randomUUID(),
      interviewId: interview.id,
      timing: { type: "fixed_slot", startAt: "2026-09-13T02:00:00Z", endAt: "2026-09-13T03:00:00Z" },
      changedAt: "2026-09-12T11:00:00Z",
    }, actor);
    const updated = await getWorkspaceQueries().read({ type: "get_job_track_detail", jobTrackId }, actor);
    expect(updated.interviews.find(item => item.id === interview.id)?.timing).toEqual({ type: "fixed_slot", startAt: "2026-09-13T02:00:00.000Z", endAt: "2026-09-13T03:00:00.000Z" });
  }, 30000);
});
