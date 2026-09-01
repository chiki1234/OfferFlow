import { describe, expect, it } from "vitest";
import { createInMemoryJobWorkflow } from "@/modules/job-workflow/in-memory";

describe("JobWorkflow", () => {
  it("用户可以创建待投递岗位", async () => {
    const workflow = createInMemoryJobWorkflow();

    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "action-create-huawei",
        companyName: "华为",
        roleName: "AI 解决方案工程师",
        jobDescription: { text: "负责 AI 解决方案的规划与落地" },
      },
      { userId: "user-1" },
    );

    expect(created).toMatchObject({
      outcome: "created",
      jobTrack: {
        companyName: "华为",
        roleName: "AI 解决方案工程师",
        lifecycle: "planned",
      },
    });
  });

  it("完成投递会绑定历史简历并生成一条投递事实", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-v3", userId: "user-1" }],
    });
    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "action-create-tencent",
        companyName: "腾讯",
        roleName: "AI 产品经理",
        jobDescription: { text: "负责 AI 产品规划" },
      },
      { userId: "user-1" },
    );

    const submitted = await workflow.execute(
      {
        type: "submit_application",
        idempotencyKey: "action-submit-tencent",
        jobTrackId: created.jobTrack.id,
        resumeId: "resume-v3",
        submittedAt: "2026-09-01T02:30:00.000Z",
      },
      { userId: "user-1" },
    );

    expect(submitted).toMatchObject({
      outcome: "submitted",
      jobTrack: {
        id: created.jobTrack.id,
        lifecycle: "active",
        resumeId: "resume-v3",
        submittedAt: "2026-09-01T02:30:00.000Z",
      },
      event: {
        kind: "ApplicationSubmitted",
        jobTrackId: created.jobTrack.id,
        occurredAt: "2026-09-01T02:30:00.000Z",
      },
    });
  });

  it("收到 Deadline 型测评会同时创建测评待办和邀约事实", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-product", userId: "user-1" }],
    });
    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "action-create-assessment-job",
        companyName: "字节跳动",
        roleName: "AI 产品经理",
        jobDescription: { text: "负责智能产品方向" },
      },
      { userId: "user-1" },
    );
    await workflow.execute(
      {
        type: "submit_application",
        idempotencyKey: "action-submit-assessment-job",
        jobTrackId: created.jobTrack.id,
        resumeId: "resume-product",
        submittedAt: "2026-09-01T03:00:00.000Z",
      },
      { userId: "user-1" },
    );

    const invited = await workflow.execute(
      {
        type: "record_assessment_invite",
        idempotencyKey: "action-assessment-invite",
        jobTrackId: created.jobTrack.id,
        assessmentKind: "assessment",
        title: "完成在线测评",
        timing: {
          type: "deadline",
          deadlineAt: "2026-09-05T15:59:00.000Z",
        },
        receivedAt: "2026-09-01T04:00:00.000Z",
      },
      { userId: "user-1" },
    );

    expect(invited).toMatchObject({
      outcome: "assessment_recorded",
      assessment: {
        jobTrackId: created.jobTrack.id,
        status: "pending",
        timing: {
          type: "deadline",
          deadlineAt: "2026-09-05T15:59:00.000Z",
        },
      },
      task: {
        jobTrackId: created.jobTrack.id,
        kind: "assessment",
        title: "完成在线测评",
        deadlineAt: "2026-09-05T15:59:00.000Z",
        completedAt: null,
      },
      event: {
        kind: "AssessmentInvited",
        jobTrackId: created.jobTrack.id,
        occurredAt: "2026-09-01T04:00:00.000Z",
      },
    });
  });
});
