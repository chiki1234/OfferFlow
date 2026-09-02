import { describe, expect, it } from "vitest";
import { createInMemoryJobWorkflow } from "@/modules/job-workflow/in-memory";

describe("JobWorkflow", () => {
  it("另一位用户不能修改不属于自己的岗位", async () => {
    const workflow = createInMemoryJobWorkflow();
    const created = await workflow.execute({
      type: "create_job_track",
      idempotencyKey: "ownership-create",
      companyName: "隔离验证公司",
      roleName: "隔离验证岗位",
      jobDescription: { text: "仅创建者可见" },
    }, { userId: "user-1" });

    await expect(workflow.execute({
      type: "update_job_track_context",
      idempotencyKey: "ownership-update",
      jobTrackId: created.jobTrack.id,
      version: created.jobTrack.version,
      companyName: "越权修改",
      roleName: "越权修改",
      jobDescription: { text: "越权修改" },
    }, { userId: "user-2" })).rejects.toThrow("NOT_FOUND");
  });

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

  it("只上传 JD 图片也可以创建待投递岗位", async () => {
    const workflow = createInMemoryJobWorkflow();
    const created = await workflow.execute({
      type: "create_job_track",
      idempotencyKey: "create-with-jd-images",
      companyName: "字节跳动",
      roleName: "AI 产品经理",
      jobDescription: { imageAssetIds: ["asset-jd-1", "asset-jd-2"] },
    }, { userId: "user-1" });

    expect(created).toMatchObject({ outcome: "created", jobTrack: { lifecycle: "planned" } });
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

  it("完成测评会在一次业务动作中完成关联待办并记录事实", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-assessment", userId: "user-1" }],
    });
    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "complete-create-job",
        companyName: "腾讯",
        roleName: "产品经理",
        jobDescription: { text: "负责产品规划与交付" },
      },
      { userId: "user-1" },
    );
    await workflow.execute(
      {
        type: "submit_application",
        idempotencyKey: "complete-submit-job",
        jobTrackId: created.jobTrack.id,
        resumeId: "resume-assessment",
        submittedAt: "2026-09-01T05:00:00.000Z",
      },
      { userId: "user-1" },
    );
    const invited = await workflow.execute(
      {
        type: "record_assessment_invite",
        idempotencyKey: "complete-invite-assessment",
        jobTrackId: created.jobTrack.id,
        assessmentKind: "assessment",
        title: "腾讯在线测评",
        timing: { type: "deadline", deadlineAt: "2026-09-05T15:59:00.000Z" },
        receivedAt: "2026-09-01T06:00:00.000Z",
      },
      { userId: "user-1" },
    );

    const completed = await workflow.execute(
      {
        type: "complete_assessment",
        idempotencyKey: "complete-assessment",
        assessmentId: invited.assessment.id,
        completedAt: "2026-09-03T12:30:00.000Z",
      },
      { userId: "user-1" },
    );

    expect(completed).toMatchObject({
      outcome: "assessment_completed",
      assessment: {
        id: invited.assessment.id,
        status: "completed",
        completedAt: "2026-09-03T12:30:00.000Z",
      },
      task: {
        id: invited.task?.id,
        completedAt: "2026-09-03T12:30:00.000Z",
      },
      event: {
        kind: "AssessmentCompleted",
        jobTrackId: created.jobTrack.id,
        subjectType: "assessment",
        subjectId: invited.assessment.id,
        occurredAt: "2026-09-03T12:30:00.000Z",
      },
    });
  });

  it("收到面试邀约会创建可改期的面试安排和邀约事实", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-interview", userId: "user-1" }],
    });
    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "interview-create-job",
        companyName: "字节跳动",
        roleName: "AI 产品经理",
        jobDescription: { text: "负责 AI 产品规划" },
      },
      { userId: "user-1" },
    );
    await workflow.execute(
      {
        type: "submit_application",
        idempotencyKey: "interview-submit-job",
        jobTrackId: created.jobTrack.id,
        resumeId: "resume-interview",
        submittedAt: "2026-09-01T07:00:00.000Z",
      },
      { userId: "user-1" },
    );

    const scheduled = await workflow.execute(
      {
        type: "schedule_interview",
        idempotencyKey: "interview-schedule",
        jobTrackId: created.jobTrack.id,
        sequenceNo: 1,
        roundLabel: "一面",
        interviewType: "视频面试",
        startAt: "2026-09-08T02:00:00.000Z",
        endAt: "2026-09-08T03:00:00.000Z",
        meetingUrl: "https://meeting.example.com/first-round",
        receivedAt: "2026-09-02T01:30:00.000Z",
      },
      { userId: "user-1" },
    );

    expect(scheduled).toMatchObject({
      outcome: "interview_scheduled",
      interview: {
        jobTrackId: created.jobTrack.id,
        sequenceNo: 1,
        roundLabel: "一面",
        interviewType: "视频面试",
        startAt: "2026-09-08T02:00:00.000Z",
        endAt: "2026-09-08T03:00:00.000Z",
        meetingUrl: "https://meeting.example.com/first-round",
        status: "scheduled",
        cancelledAt: null,
        occurredAt: null,
        reviewedAt: null,
      },
      event: {
        kind: "InterviewInvited",
        jobTrackId: created.jobTrack.id,
        subjectType: "interview",
        occurredAt: "2026-09-02T01:30:00.000Z",
      },
    });
    expect(scheduled.event.subjectId).toBe(scheduled.interview.id);
  });

  it("面试改期会更新原安排并保留前后时间事实", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-reschedule", userId: "user-1" }],
    });
    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "reschedule-create-job",
        companyName: "阿里巴巴",
        roleName: "AI 解决方案产品经理",
        jobDescription: { text: "负责 AI 解决方案产品化" },
      },
      { userId: "user-1" },
    );
    await workflow.execute(
      {
        type: "submit_application",
        idempotencyKey: "reschedule-submit-job",
        jobTrackId: created.jobTrack.id,
        resumeId: "resume-reschedule",
        submittedAt: "2026-09-01T08:00:00.000Z",
      },
      { userId: "user-1" },
    );
    const scheduled = await workflow.execute(
      {
        type: "schedule_interview",
        idempotencyKey: "reschedule-schedule",
        jobTrackId: created.jobTrack.id,
        roundLabel: "二面",
        interviewType: "视频面试",
        startAt: "2026-09-09T02:00:00.000Z",
        endAt: "2026-09-09T03:00:00.000Z",
        receivedAt: "2026-09-02T02:00:00.000Z",
      },
      { userId: "user-1" },
    );

    const rescheduled = await workflow.execute(
      {
        type: "reschedule_interview",
        idempotencyKey: "reschedule-change-time",
        interviewId: scheduled.interview.id,
        startAt: "2026-09-10T06:00:00.000Z",
        endAt: "2026-09-10T07:30:00.000Z",
        changedAt: "2026-09-03T03:00:00.000Z",
      },
      { userId: "user-1" },
    );

    expect(rescheduled).toMatchObject({
      outcome: "interview_rescheduled",
      interview: {
        id: scheduled.interview.id,
        startAt: "2026-09-10T06:00:00.000Z",
        endAt: "2026-09-10T07:30:00.000Z",
        status: "scheduled",
      },
      event: {
        kind: "InterviewRescheduled",
        subjectType: "interview",
        subjectId: scheduled.interview.id,
        occurredAt: "2026-09-03T03:00:00.000Z",
        payload: {
          previousStartAt: "2026-09-09T02:00:00.000Z",
          previousEndAt: "2026-09-09T03:00:00.000Z",
          startAt: "2026-09-10T06:00:00.000Z",
          endAt: "2026-09-10T07:30:00.000Z",
        },
      },
    });
  });

  it("取消面试会保留原安排并记录取消事实", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-cancel", userId: "user-1" }],
    });
    const created = await workflow.execute(
      {
        type: "create_job_track",
        idempotencyKey: "cancel-create-job",
        companyName: "小米",
        roleName: "AI 产品经理",
        jobDescription: { text: "负责智能助手产品" },
      },
      { userId: "user-1" },
    );
    await workflow.execute(
      {
        type: "submit_application",
        idempotencyKey: "cancel-submit-job",
        jobTrackId: created.jobTrack.id,
        resumeId: "resume-cancel",
        submittedAt: "2026-09-01T08:30:00.000Z",
      },
      { userId: "user-1" },
    );
    const scheduled = await workflow.execute(
      {
        type: "schedule_interview",
        idempotencyKey: "cancel-schedule",
        jobTrackId: created.jobTrack.id,
        roundLabel: "HR 沟通",
        interviewType: "电话面试",
        startAt: "2026-09-11T02:00:00.000Z",
        endAt: "2026-09-11T02:30:00.000Z",
        receivedAt: "2026-09-02T03:00:00.000Z",
      },
      { userId: "user-1" },
    );

    const cancelled = await workflow.execute(
      {
        type: "cancel_interview",
        idempotencyKey: "cancel-interview",
        interviewId: scheduled.interview.id,
        reason: "招聘方调整安排",
        cancelledAt: "2026-09-04T01:00:00.000Z",
      },
      { userId: "user-1" },
    );

    expect(cancelled).toMatchObject({
      outcome: "interview_cancelled",
      interview: {
        id: scheduled.interview.id,
        startAt: "2026-09-11T02:00:00.000Z",
        endAt: "2026-09-11T02:30:00.000Z",
        status: "cancelled",
        cancelledAt: "2026-09-04T01:00:00.000Z",
      },
      event: {
        kind: "InterviewCancelled",
        subjectType: "interview",
        subjectId: scheduled.interview.id,
        occurredAt: "2026-09-04T01:00:00.000Z",
        payload: { reason: "招聘方调整安排" },
      },
    });
  });

  it("确认面试发生需要显式记录事实，不由时间自动推导", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-occurred", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "occurred-create", companyName: "美团", roleName: "AI 产品经理", jobDescription: { text: "智能服务产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "occurred-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-occurred", submittedAt: "2026-09-01T09:00:00.000Z" }, { userId: "user-1" });
    const scheduled = await workflow.execute({ type: "schedule_interview", idempotencyKey: "occurred-schedule", jobTrackId: created.jobTrack.id, roundLabel: "一面", interviewType: "视频面试", startAt: "2026-09-05T02:00:00.000Z", endAt: "2026-09-05T03:00:00.000Z", receivedAt: "2026-09-02T04:00:00.000Z" }, { userId: "user-1" });

    const occurred = await workflow.execute({
      type: "confirm_interview_occurred",
      idempotencyKey: "occurred-confirm",
      interviewId: scheduled.interview.id,
      occurredAt: "2026-09-05T03:00:00.000Z",
    }, { userId: "user-1" });

    expect(occurred).toMatchObject({
      outcome: "interview_occurred",
      interview: { id: scheduled.interview.id, occurredAt: "2026-09-05T03:00:00.000Z" },
      event: { kind: "InterviewOccurred", subjectId: scheduled.interview.id, occurredAt: "2026-09-05T03:00:00.000Z" },
    });
  });

  it("完成面试复盘会必要时补记面试发生事实", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-review", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "review-create", companyName: "京东", roleName: "AI 产品经理", jobDescription: { text: "智能供应链产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "review-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-review", submittedAt: "2026-09-01T10:00:00.000Z" }, { userId: "user-1" });
    const scheduled = await workflow.execute({ type: "schedule_interview", idempotencyKey: "review-schedule", jobTrackId: created.jobTrack.id, roundLabel: "二面", interviewType: "现场面试", startAt: "2026-09-06T02:00:00.000Z", endAt: "2026-09-06T03:00:00.000Z", receivedAt: "2026-09-02T05:00:00.000Z" }, { userId: "user-1" });

    const reviewed = await workflow.execute({
      type: "complete_interview_review",
      idempotencyKey: "review-complete",
      interviewId: scheduled.interview.id,
      reviewedAt: "2026-09-06T05:00:00.000Z",
    }, { userId: "user-1" });

    expect(reviewed).toMatchObject({
      outcome: "interview_reviewed",
      interview: {
        id: scheduled.interview.id,
        occurredAt: "2026-09-06T05:00:00.000Z",
        reviewedAt: "2026-09-06T05:00:00.000Z",
      },
      occurredEvent: { kind: "InterviewOccurred", subjectId: scheduled.interview.id },
      event: { kind: "InterviewReviewed", subjectId: scheduled.interview.id, occurredAt: "2026-09-06T05:00:00.000Z" },
    });
  });

  it("普通待办可以在求职推进中创建并完成", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-task", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "task-create-job", companyName: "快手", roleName: "AI 产品经理", jobDescription: { text: "智能创作产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "task-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-task", submittedAt: "2026-09-01T11:00:00.000Z" }, { userId: "user-1" });

    const taskCreated = await workflow.execute({
      type: "create_task",
      idempotencyKey: "task-create",
      jobTrackId: created.jobTrack.id,
      kind: "generic",
      title: "整理一面准备提纲",
      deadlineAt: "2026-09-07T15:59:00.000Z",
    }, { userId: "user-1" });
    const completed = await workflow.execute({
      type: "complete_task",
      idempotencyKey: "task-complete",
      taskId: taskCreated.task.id,
      completedAt: "2026-09-06T12:00:00.000Z",
    }, { userId: "user-1" });

    expect(taskCreated).toMatchObject({ outcome: "task_created", task: { jobTrackId: created.jobTrack.id, kind: "generic", title: "整理一面准备提纲", completedAt: null, cancelledAt: null } });
    expect(completed).toMatchObject({ outcome: "task_completed", task: { id: taskCreated.task.id, completedAt: "2026-09-06T12:00:00.000Z" } });
    const secondTask = await workflow.execute({ type: "create_task", idempotencyKey: "task-create-second", jobTrackId: created.jobTrack.id, kind: "generic", title: "已不再需要的准备", deadlineAt: "2026-09-08T15:59:00.000Z" }, { userId: "user-1" });
    const cancelled = await workflow.execute({ type: "cancel_task", idempotencyKey: "task-cancel", taskId: secondTask.task.id, cancelledAt: "2026-09-06T13:00:00.000Z" }, { userId: "user-1" });
    expect(cancelled).toMatchObject({ outcome: "task_cancelled", task: { id: secondTask.task.id, cancelledAt: "2026-09-06T13:00:00.000Z" } });
  });

  it("开放的普通待办可以修改标题、截止时间和面试关联", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-task-update", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "task-update-job", companyName: "小红书", roleName: "AI 产品经理", jobDescription: { text: "智能社区产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "task-update-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-task-update", submittedAt: "2026-09-01T11:00:00.000Z" }, { userId: "user-1" });
    const interview = await workflow.execute({ type: "schedule_interview", idempotencyKey: "task-update-interview", jobTrackId: created.jobTrack.id, roundLabel: "一面", interviewType: "视频面试", startAt: "2026-09-08T02:00:00.000Z", endAt: "2026-09-08T03:00:00.000Z", receivedAt: "2026-09-02T05:00:00.000Z" }, { userId: "user-1" });
    const task = await workflow.execute({ type: "create_task", idempotencyKey: "task-update-create", jobTrackId: created.jobTrack.id, kind: "generic", title: "准备问题", deadlineAt: "2026-09-07T10:00:00.000Z" }, { userId: "user-1" });

    const updated = await workflow.execute({
      type: "update_task",
      idempotencyKey: "task-update-save",
      taskId: task.task.id,
      title: "整理一面问题清单",
      deadlineAt: "2026-09-07T12:00:00.000Z",
      interviewId: interview.interview.id,
    }, { userId: "user-1" });

    expect(updated).toMatchObject({
      outcome: "task_updated",
      task: {
        id: task.task.id,
        title: "整理一面问题清单",
        deadlineAt: "2026-09-07T12:00:00.000Z",
        interviewId: interview.interview.id,
      },
    });
  });

  it("面试准备待办必须关联同一岗位下的面试", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-prep", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "prep-job", companyName: "滴滴", roleName: "AI 产品经理", jobDescription: { text: "智能出行产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "prep-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-prep", submittedAt: "2026-09-01T11:00:00.000Z" }, { userId: "user-1" });
    const interview = await workflow.execute({ type: "schedule_interview", idempotencyKey: "prep-interview", jobTrackId: created.jobTrack.id, roundLabel: "一面", interviewType: "视频面试", startAt: "2026-09-08T02:00:00.000Z", endAt: "2026-09-08T03:00:00.000Z", receivedAt: "2026-09-02T05:00:00.000Z" }, { userId: "user-1" });

    const task = await workflow.execute({ type: "create_task", idempotencyKey: "prep-task", jobTrackId: created.jobTrack.id, interviewId: interview.interview.id, kind: "interview_prep", title: "准备项目追问", deadlineAt: "2026-09-07T12:00:00.000Z" }, { userId: "user-1" });

    expect(task).toMatchObject({ outcome: "task_created", task: { kind: "interview_prep", interviewId: interview.interview.id, jobTrackId: created.jobTrack.id } });
  });

  it("通用待办可以不绑定岗位并独立完成", async () => {
    const workflow = createInMemoryJobWorkflow();
    const created = await workflow.execute({ type: "create_task", idempotencyKey: "general-task-create", kind: "generic", title: "更新个人作品集", deadlineAt: "2026-09-20T12:00:00.000Z" }, { userId: "user-1" });
    const completed = await workflow.execute({ type: "complete_task", idempotencyKey: "general-task-complete", taskId: created.task.id, completedAt: "2026-09-20T10:00:00.000Z" }, { userId: "user-1" });
    expect(created).toMatchObject({ outcome: "task_created", task: { jobTrackId: null, kind: "generic", title: "更新个人作品集" } });
    expect(completed).toMatchObject({ outcome: "task_completed", task: { completedAt: "2026-09-20T10:00:00.000Z" } });
  });

  it("记录拒信会结束求职推进并保留拒绝事实", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-rejection", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "reject-create", companyName: "百度", roleName: "AI 产品经理", jobDescription: { text: "智能搜索产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "reject-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-rejection", submittedAt: "2026-09-01T12:00:00.000Z" }, { userId: "user-1" });

    const rejected = await workflow.execute({
      type: "record_rejection",
      idempotencyKey: "reject-record",
      jobTrackId: created.jobTrack.id,
      occurredAt: "2026-09-10T01:00:00.000Z",
      notes: "感谢参与，岗位暂不匹配",
    }, { userId: "user-1" });

    expect(rejected).toMatchObject({
      outcome: "job_track_ended",
      jobTrack: { id: created.jobTrack.id, lifecycle: "ended" },
      event: { kind: "RejectionReceived", subjectType: "job_track", subjectId: created.jobTrack.id, occurredAt: "2026-09-10T01:00:00.000Z", payload: { notes: "感谢参与，岗位暂不匹配" } },
    });
  });

  it("用户可以主动结束一条求职推进", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-end", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "end-create", companyName: "携程", roleName: "AI 产品经理", jobDescription: { text: "智能旅行产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "end-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-end", submittedAt: "2026-09-01T13:00:00.000Z" }, { userId: "user-1" });
    const ended = await workflow.execute({ type: "end_job_track", idempotencyKey: "end-withdraw", jobTrackId: created.jobTrack.id, reason: "withdrawn", occurredAt: "2026-09-11T01:00:00.000Z" }, { userId: "user-1" });
    expect(ended).toMatchObject({ outcome: "job_track_ended", jobTrack: { lifecycle: "ended" }, event: { kind: "JobTrackEnded", payload: { reason: "withdrawn" } } });
  });

  it("极速建档可以用最小信息批量迁移历史岗位", async () => {
    const workflow = createInMemoryJobWorkflow();
    const imported = await workflow.execute({
      type: "quick_import_job_tracks",
      idempotencyKey: "quick-import-history",
      lifecycle: "active",
      entries: [
        { companyName: "华为", roleName: "AI 解决方案工程师" },
        { companyName: "腾讯", roleName: "AI 产品经理" },
      ],
    }, { userId: "user-1" });
    expect(imported).toMatchObject({ outcome: "job_tracks_imported", jobTracks: [{ companyName: "华为", lifecycle: "active" }, { companyName: "腾讯", lifecycle: "active" }] });
    expect(imported.jobTracks.every((job) => job.resumeId === null && job.submittedAt === null)).toBe(true);
  });

  it("无法归入结构化环节的进展可以作为只读事实保留", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-progress", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "progress-create", companyName: "网易", roleName: "AI 产品经理", jobDescription: { text: "智能内容产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "progress-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-progress", submittedAt: "2026-09-01T14:00:00.000Z" }, { userId: "user-1" });
    const progress = await workflow.execute({ type: "record_generic_progress", idempotencyKey: "progress-record", jobTrackId: created.jobTrack.id, summary: "招聘方通知流程需要延后一周", occurredAt: "2026-09-08T02:00:00.000Z" }, { userId: "user-1" });
    expect(progress).toMatchObject({ outcome: "progress_recorded", event: { kind: "GenericProgress", payload: { summary: "招聘方通知流程需要延后一周" } } });
  });

  it("取消测评会同步取消关联待办并记录事实", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-cancel-assessment", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "cancel-assessment-create", companyName: "滴滴", roleName: "AI 产品经理", jobDescription: { text: "智能出行产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "cancel-assessment-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-cancel-assessment", submittedAt: "2026-09-01T15:00:00.000Z" }, { userId: "user-1" });
    const invited = await workflow.execute({ type: "record_assessment_invite", idempotencyKey: "cancel-assessment-invite", jobTrackId: created.jobTrack.id, assessmentKind: "written_test", title: "在线笔试", timing: { type: "deadline", deadlineAt: "2026-09-12T15:59:00.000Z" }, receivedAt: "2026-09-02T06:00:00.000Z" }, { userId: "user-1" });
    const cancelled = await workflow.execute({ type: "cancel_assessment", idempotencyKey: "cancel-assessment", assessmentId: invited.assessment.id, cancelledAt: "2026-09-03T06:00:00.000Z" }, { userId: "user-1" });
    expect(cancelled).toMatchObject({ outcome: "assessment_cancelled", assessment: { status: "cancelled", cancelledAt: "2026-09-03T06:00:00.000Z" }, task: { id: invited.task?.id, cancelledAt: "2026-09-03T06:00:00.000Z" }, event: { kind: "AssessmentCancelled" } });
  });

  it("彻底删除测评会同时删除关联待办", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-delete-assessment", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "delete-assessment-create", companyName: "滴滴", roleName: "产品经理", jobDescription: { text: "智能出行" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "delete-assessment-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-delete-assessment", submittedAt: "2026-09-01T15:00:00.000Z" }, { userId: "user-1" });
    const invited = await workflow.execute({ type: "record_assessment_invite", idempotencyKey: "delete-assessment-invite", jobTrackId: created.jobTrack.id, assessmentKind: "written_test", title: "在线笔试", timing: { type: "deadline", deadlineAt: "2026-09-12T15:59:00.000Z" }, receivedAt: "2026-09-02T06:00:00.000Z" }, { userId: "user-1" });

    const deleted = await workflow.execute({ type: "delete_assessment", idempotencyKey: "delete-assessment-record", assessmentId: invited.assessment.id }, { userId: "user-1" });

    expect(deleted).toEqual({ outcome: "assessment_deleted", assessmentId: invited.assessment.id, jobTrackId: created.jobTrack.id });
    await expect(workflow.execute({ type: "complete_assessment", idempotencyKey: "delete-assessment-complete-after", assessmentId: invited.assessment.id, completedAt: "2026-09-03T06:00:00.000Z" }, { userId: "user-1" })).rejects.toThrow("NOT_FOUND");
    await expect(workflow.execute({ type: "complete_task", idempotencyKey: "delete-assessment-task-after", taskId: invited.task!.id, completedAt: "2026-09-03T06:00:00.000Z" }, { userId: "user-1" })).rejects.toThrow("NOT_FOUND");
  });

  it("彻底删除面试会同时删除关联准备待办", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-delete-interview", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "delete-interview-create", companyName: "小米", roleName: "产品经理", jobDescription: { text: "智能助手" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "delete-interview-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-delete-interview", submittedAt: "2026-09-01T15:00:00.000Z" }, { userId: "user-1" });
    const scheduled = await workflow.execute({ type: "schedule_interview", idempotencyKey: "delete-interview-schedule", jobTrackId: created.jobTrack.id, roundLabel: "一面", interviewType: "视频面试", startAt: "2026-09-12T02:00:00.000Z", endAt: "2026-09-12T03:00:00.000Z", receivedAt: "2026-09-02T06:00:00.000Z" }, { userId: "user-1" });
    const task = await workflow.execute({ type: "create_task", idempotencyKey: "delete-interview-task", jobTrackId: created.jobTrack.id, interviewId: scheduled.interview.id, kind: "interview_prep", title: "准备一面", deadlineAt: "2026-09-11T10:00:00.000Z" }, { userId: "user-1" });

    const deleted = await workflow.execute({ type: "delete_interview", idempotencyKey: "delete-interview-record", interviewId: scheduled.interview.id }, { userId: "user-1" });

    expect(deleted).toEqual({ outcome: "interview_deleted", interviewId: scheduled.interview.id, jobTrackId: created.jobTrack.id });
    await expect(workflow.execute({ type: "confirm_interview_occurred", idempotencyKey: "delete-interview-occurred-after", interviewId: scheduled.interview.id, occurredAt: "2026-09-12T03:00:00.000Z" }, { userId: "user-1" })).rejects.toThrow("NOT_FOUND");
    await expect(workflow.execute({ type: "complete_task", idempotencyKey: "delete-interview-task-after", taskId: task.task.id, completedAt: "2026-09-11T10:00:00.000Z" }, { userId: "user-1" })).rejects.toThrow("NOT_FOUND");
  });

  it("未投递岗位可删除，不会伪造结束历史", async () => {
    const workflow = createInMemoryJobWorkflow();
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "delete-planned-create", companyName: "联想", roleName: "AI 产品经理", jobDescription: { text: "AI PC 产品" } }, { userId: "user-1" });
    const deleted = await workflow.execute({ type: "delete_planned_job_track", idempotencyKey: "delete-planned", jobTrackId: created.jobTrack.id }, { userId: "user-1" });
    expect(deleted).toEqual({ outcome: "job_track_deleted", jobTrackId: created.jobTrack.id });
  });

  it("编辑岗位上下文使用版本检查防止静默覆盖", async () => {
    const workflow = createInMemoryJobWorkflow();
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "update-context-create", companyName: "华为", roleName: "AI 解决方案工程师", jobDescription: { text: "初始 JD" } }, { userId: "user-1" });
    const updated = await workflow.execute({
      type: "update_job_track_context",
      idempotencyKey: "update-context",
      jobTrackId: created.jobTrack.id,
      version: created.jobTrack.version,
      companyName: "华为技术有限公司",
      roleName: "AI 解决方案工程师",
      jobDescription: { text: "更新后的完整 JD" },
      jobUrl: "https://career.example.com/job/1",
    }, { userId: "user-1" });
    expect(updated).toMatchObject({ outcome: "context_updated", jobTrack: { companyName: "华为技术有限公司", version: 2, jobUrl: "https://career.example.com/job/1" } });
    await expect(workflow.execute({
      type: "update_job_track_context",
      idempotencyKey: "update-context-stale",
      jobTrackId: created.jobTrack.id,
      version: created.jobTrack.version,
      companyName: "过期修改",
      roleName: "AI 解决方案工程师",
      jobDescription: { text: "过期 JD" },
    }, { userId: "user-1" })).rejects.toThrow("CONFLICT");
  });

  it("保存面试转录会在必要时自动确认面试发生", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume-transcript", userId: "user-1" }] });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "transcript-create", companyName: "哔哩哔哩", roleName: "AI 产品经理", jobDescription: { text: "智能内容产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "transcript-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-transcript", submittedAt: "2026-09-01T16:00:00.000Z" }, { userId: "user-1" });
    const scheduled = await workflow.execute({ type: "schedule_interview", idempotencyKey: "transcript-schedule", jobTrackId: created.jobTrack.id, roundLabel: "一面", interviewType: "视频面试", startAt: "2026-09-13T02:00:00.000Z", endAt: "2026-09-13T03:00:00.000Z", receivedAt: "2026-09-02T07:00:00.000Z" }, { userId: "user-1" });
    const saved = await workflow.execute({ type: "save_interview_transcript", idempotencyKey: "transcript-save", interviewId: scheduled.interview.id, transcriptText: "面试官：请介绍一下你的项目\n我：项目的核心目标是…", savedAt: "2026-09-13T04:00:00.000Z" }, { userId: "user-1" });
    expect(saved).toMatchObject({ outcome: "transcript_saved", interview: { id: scheduled.interview.id, occurredAt: "2026-09-13T04:00:00.000Z" }, occurredEvent: { kind: "InterviewOccurred", payload: { confirmedBy: "transcript" } } });
  });

  it("面试转录也可以只保存私有文件", async () => {
    const workflow = createInMemoryJobWorkflow({
      resumes: [{ id: "resume-transcript-file", userId: "user-1" }],
      assets: [{ id: "asset-transcript-file", userId: "user-1", kind: "transcript" }],
    });
    const created = await workflow.execute({ type: "create_job_track", idempotencyKey: "transcript-file-create", companyName: "米哈游", roleName: "AI 产品经理", jobDescription: { text: "智能内容产品" } }, { userId: "user-1" });
    await workflow.execute({ type: "submit_application", idempotencyKey: "transcript-file-submit", jobTrackId: created.jobTrack.id, resumeId: "resume-transcript-file", submittedAt: "2026-09-01T16:00:00.000Z" }, { userId: "user-1" });
    const scheduled = await workflow.execute({ type: "schedule_interview", idempotencyKey: "transcript-file-schedule", jobTrackId: created.jobTrack.id, roundLabel: "二面", interviewType: "视频面试", startAt: "2026-09-14T02:00:00.000Z", endAt: "2026-09-14T03:00:00.000Z", receivedAt: "2026-09-02T07:00:00.000Z" }, { userId: "user-1" });

    const saved = await workflow.execute({ type: "save_interview_transcript", idempotencyKey: "transcript-file-save", interviewId: scheduled.interview.id, transcriptAssetId: "asset-transcript-file", savedAt: "2026-09-14T04:00:00.000Z" }, { userId: "user-1" });

    expect(saved).toMatchObject({ outcome: "transcript_saved", interview: { transcriptText: null, transcriptAssetId: "asset-transcript-file", occurredAt: "2026-09-14T04:00:00.000Z" }, occurredEvent: { kind: "InterviewOccurred" } });
  });
});
