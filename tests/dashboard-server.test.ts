import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDatabaseRuntime } from "../src/db/runtime";
import { users } from "../src/db/schema";
import { getJobWorkflow } from "../src/modules/job-workflow/composition";
import { getWorkspaceQueries } from "../src/modules/workspace-queries/composition";

// Only the Next.js cache boundary is replaced; authentication, database,
// server action and domain workflow all run as production implementations.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

describe.skipIf(process.env.DASHBOARD_INTEGRATION !== "1")(
  "工作台真实数据库操作",
  () => {
    const userId = randomUUID();
    const actor = { userId };
    const otherUserId = randomUUID();
    let complete: typeof import("../src/app/dashboard-actions").completeDashboardItemAction;
    let createdUser = false;
    beforeAll(async () => {
      config({ path: [".env.local", ".env"], quiet: true });
      vi.stubEnv("AUTH_MODE", "local");
      vi.stubEnv("APP_USER_ID", userId);
      await getDatabaseRuntime()
        .db.insert(users)
        .values(
          [userId, otherUserId].map((id) => ({
            id,
            name: "工作台隔离验收",
            email: `${id}@example.invalid`,
          })),
        );
      createdUser = true;
      complete = (await import("../src/app/dashboard-actions"))
        .completeDashboardItemAction;
    });
    afterAll(async () => {
      if (createdUser)
        await getDatabaseRuntime()
          .db.delete(users)
          .where(inArray(users.id, [userId, otherUserId]));
      if (createdUser) await getDatabaseRuntime().close();
      vi.unstubAllEnvs();
    });

    it("首页完成通用待办后，真实工作台查询不再返回该事项", async () => {
      const created = await getJobWorkflow().execute(
        {
          type: "create_task",
          idempotencyKey: randomUUID(),
          kind: "generic",
          title: "首页完成验证",
          deadlineAt: new Date().toISOString(),
        },
        actor,
      );
      const before = await getWorkspaceQueries().read(
        { type: "get_dashboard" },
        actor,
      );
      expect(
        before.todayItems.some((item) => item.id === created.task.id),
      ).toBe(true);
      const form = new FormData();
      form.set("itemId", created.task.id);
      form.set("sourceType", "task");
      form.set("idempotencyKey", randomUUID());
      const result = await complete({ error: null, success: null }, form);
      expect(result).toEqual({ error: null, success: "待办已完成。" });
      const after = await getWorkspaceQueries().read(
        { type: "get_dashboard" },
        actor,
      );
      expect(after.todayItems.some((item) => item.id === created.task.id)).toBe(
        false,
      );
    });

    async function activeJob() {
      const result = await getJobWorkflow().execute(
        {
          type: "quick_import_job_tracks",
          idempotencyKey: randomUUID(),
          lifecycle: "active",
          entries: [{ companyName: "隔离测试公司", roleName: "工作台验证" }],
        },
        actor,
      );
      return result.jobTracks[0].id;
    }
    function completionForm(id: string, sourceType: string) {
      const form = new FormData();
      form.set("itemId", id);
      form.set("sourceType", sourceType);
      return form;
    }

    it("完成测评同步关联任务，重复提交不会新增第二条完成事实", async () => {
      const jobTrackId = await activeJob();
      const invited = await getJobWorkflow().execute(
        {
          type: "record_assessment_invite",
          idempotencyKey: randomUUID(),
          jobTrackId,
          assessmentKind: "written_test",
          title: "隔离测评",
          timing: {
            type: "deadline",
            deadlineAt: new Date(Date.now() - 60_000).toISOString(),
          },
          receivedAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        actor,
      );
      const form = completionForm(invited.assessment.id, "assessment");
      expect(await complete({ error: null, success: null }, form)).toEqual({
        error: null,
        success: "测评已完成。",
      });
      expect(await complete({ error: null, success: null }, form)).toEqual({
        error: null,
        success: "测评已完成。",
      });
      const detail = await getWorkspaceQueries().read(
        { type: "get_job_track_detail", jobTrackId },
        actor,
      );
      expect(detail.assessments[0].status).toBe("completed");
      expect(
        detail.tasks.find((task) => task.assessmentId === invited.assessment.id)
          ?.completedAt,
      ).toBeTruthy();
      expect(
        detail.events.filter((event) => event.kind === "AssessmentCompleted"),
      ).toHaveLength(1);
    });

    it("拒绝跨用户完成，并且不会更改另一用户的待办", async () => {
      const otherActor = { userId: otherUserId };
      const created = await getJobWorkflow().execute(
        {
          type: "create_task",
          idempotencyKey: randomUUID(),
          kind: "generic",
          title: "其他用户的待办",
          deadlineAt: new Date().toISOString(),
        },
        otherActor,
      );
      expect(
        (
          await complete(
            { error: null, success: null },
            completionForm(created.task.id, "task"),
          )
        ).error,
      ).toBeTruthy();
      const otherDashboard = await getWorkspaceQueries().read(
        { type: "get_dashboard" },
        otherActor,
      );
      expect(
        otherDashboard.todayItems.some((item) => item.id === created.task.id),
      ).toBe(true);
    });

    it("不接受复盘完成或无效标识，保持待办原状", async () => {
      const created = await getJobWorkflow().execute(
        {
          type: "create_task",
          idempotencyKey: randomUUID(),
          kind: "generic",
          title: "错误输入验证",
          deadlineAt: new Date().toISOString(),
        },
        actor,
      );
      expect(
        (
          await complete(
            { error: null, success: null },
            completionForm(created.task.id, "interview_review"),
          )
        ).error,
      ).toBeTruthy();
      expect(
        (
          await complete(
            { error: null, success: null },
            completionForm("invalid-id", "task"),
          )
        ).error,
      ).toBeTruthy();
      const dashboard = await getWorkspaceQueries().read(
        { type: "get_dashboard" },
        actor,
      );
      expect(
        dashboard.todayItems.some((item) => item.id === created.task.id),
      ).toBe(true);
    });

    it("临近面试的无截止准备任务仍被聚合，并提供正确的时间与跳转上下文", async () => {
      const jobTrackId = await activeJob();
      const interview = await getJobWorkflow().execute(
        {
          type: "schedule_interview",
          idempotencyKey: randomUUID(),
          jobTrackId,
          roundLabel: "二面",
          interviewType: "视频",
          startAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
          endAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
          receivedAt: new Date().toISOString(),
        },
        actor,
      );
      const task = await getJobWorkflow().execute(
        {
          type: "create_task",
          idempotencyKey: randomUUID(),
          jobTrackId,
          kind: "interview_prep",
          interviewId: interview.interview.id,
          title: "提前准备二面",
        },
        actor,
      );
      const dashboard = await getWorkspaceQueries().read(
        { type: "get_dashboard" },
        actor,
      );
      expect(
        dashboard.todayItems.find((item) => item.id === task.task.id),
      ).toMatchObject({
        taskKind: "interview_prep",
        interviewId: interview.interview.id,
        timeSource: "interview",
        dueAt: interview.interview.startAt,
      });
    });

    it("跟进保存到对应岗位，更新最近进展且不改变等待较久规则", async () => {
      const jobTrackId = await activeJob();
      const past = new Date(Date.now() - 9 * 86_400_000);
      await getJobWorkflow().execute(
        {
          type: "schedule_interview",
          idempotencyKey: randomUUID(),
          jobTrackId,
          roundLabel: "一面",
          interviewType: "视频",
          startAt: past.toISOString(),
          endAt: new Date(past.getTime() + 3_600_000).toISOString(),
          receivedAt: new Date(past.getTime() - 86_400_000).toISOString(),
        },
        actor,
      );
      const { recordQuickProgressAction } =
        await import("../src/app/quick/actions");
      const form = new FormData();
      form.set("jobTrackId", jobTrackId);
      form.set("progressType", "generic");
      form.set("summary", "已联系招聘方，等待回复");
      form.set("idempotencyKey", randomUUID());
      expect(
        (await recordQuickProgressAction({ error: null, success: null }, form))
          .success,
      ).toBeTruthy();
      const detail = await getWorkspaceQueries().read(
        { type: "get_job_track_detail", jobTrackId },
        actor,
      );
      expect(
        detail.events.find((event) => event.kind === "GenericProgress")
          ?.payload,
      ).toMatchObject({ summary: "已联系招聘方，等待回复" });
      expect(detail.jobTrack.attentionFlags).toContain("waiting_long");
      expect(
        new Date(detail.jobTrack.lastProgressAt!).getTime(),
      ).toBeGreaterThan(past.getTime());
    });
  },
);
