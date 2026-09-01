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
});
