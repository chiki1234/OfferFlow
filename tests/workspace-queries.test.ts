import { describe, expect, it } from "vitest";
import { deriveJobTrackStatus } from "@/modules/workspace-queries/derive-job-track-status";
import { deriveJobTrackCurrentNext } from "@/modules/workspace-queries/derive-job-track-current-next";
import { markCalendarConflicts } from "@/modules/workspace-queries/calendar-conflicts";
import { sortDashboardActionItems } from "@/modules/workspace-queries/dashboard-priority";
import { findImminentInterviewPreparationTasks } from "@/modules/workspace-queries/dashboard-preparation";

describe("deriveJobTrackStatus", () => {
  it("未完成且逾期的测评会要求行动并标记逾期", () => {
    const view = deriveJobTrackStatus(
      {
        lifecycle: "active",
        submittedAt: "2026-08-20T00:00:00.000Z",
        assessments: [
          {
            id: "assessment-1",
            status: "pending",
            timing: { type: "deadline", deadlineAt: "2026-08-31T15:59:00.000Z" },
            completedAt: null,
          },
        ],
        interviews: [],
        tasks: [],
      },
      new Date("2026-09-01T04:00:00.000Z"),
    );

    expect(view).toEqual({
      actionState: "action_required",
      attentionFlags: ["overdue"],
      reviewDueInterviewIds: [],
    });
  });

  it("面试时间到达只推导待复盘，岗位进入 waiting", () => {
    const view = deriveJobTrackStatus(
      {
        lifecycle: "active",
        submittedAt: "2026-08-28T00:00:00.000Z",
        assessments: [],
        interviews: [
          {
            id: "interview-1",
            status: "scheduled",
            startAt: "2026-09-01T02:00:00.000Z",
            occurredAt: null,
            reviewedAt: null,
          },
        ],
        tasks: [],
      },
      new Date("2026-09-01T04:00:00.000Z"),
    );

    expect(view).toEqual({
      actionState: "waiting",
      attentionFlags: [],
      reviewDueInterviewIds: ["interview-1"],
    });
  });

  it("面试后等待超过 7 天会标记 waiting_long", () => {
    const view = deriveJobTrackStatus(
      {
        lifecycle: "active",
        submittedAt: "2026-08-01T00:00:00.000Z",
        assessments: [],
        interviews: [
          {
            id: "interview-2",
            status: "scheduled",
            startAt: "2026-08-20T02:00:00.000Z",
            occurredAt: "2026-08-20T03:00:00.000Z",
            reviewedAt: "2026-08-20T04:00:00.000Z",
          },
        ],
        tasks: [],
      },
      new Date("2026-09-01T04:00:00.000Z"),
    );

    expect(view).toEqual({
      actionState: "waiting",
      attentionFlags: ["waiting_long"],
      reviewDueInterviewIds: [],
    });
  });
});

describe("deriveJobTrackCurrentNext", () => {
  it("优先展示已经逾期的行动，而不是更晚的面试", () => {
    const view = deriveJobTrackCurrentNext(
      {
        lifecycle: "active",
        submittedAt: "2026-08-20T00:00:00.000Z",
        endedAt: null,
        endReason: null,
        lastProgressAt: "2026-08-25T00:00:00.000Z",
        assessments: [{
          id: "assessment-1",
          title: "在线测评",
          status: "pending",
          timing: { type: "deadline", deadlineAt: "2026-08-31T15:59:00.000Z" },
          completedAt: null,
          cancelledAt: null,
        }],
        interviews: [{
          id: "interview-1",
          roundLabel: "一面",
          interviewType: "技术面",
          startAt: "2026-09-03T02:00:00.000Z",
          endAt: "2026-09-03T03:00:00.000Z",
          status: "scheduled",
          occurredAt: null,
          reviewedAt: null,
        }],
        tasks: [],
      },
      new Date("2026-09-01T04:00:00.000Z"),
    );

    expect(view).toEqual({
      state: "action_required",
      title: "在线测评",
      detail: "已超过截止时间",
      scheduledAt: "2026-08-31T15:59:00.000Z",
      waitingDays: null,
    });
  });

  it("没有下一步行动时展示从最近进展开始的等待天数", () => {
    const view = deriveJobTrackCurrentNext(
      {
        lifecycle: "active",
        submittedAt: "2026-08-20T00:00:00.000Z",
        endedAt: null,
        endReason: null,
        lastProgressAt: "2026-08-28T04:00:00.000Z",
        assessments: [],
        interviews: [],
        tasks: [],
      },
      new Date("2026-09-01T04:00:00.000Z"),
    );

    expect(view).toEqual({
      state: "waiting",
      title: "等待公司下一步",
      detail: "最近进展后已等待 4 天",
      scheduledAt: null,
      waitingDays: 4,
    });
  });

  it("待投递与已结束岗位不会伪造下一步行动", () => {
    const base = {
      submittedAt: null,
      lastProgressAt: null,
      assessments: [],
      interviews: [],
      tasks: [],
    };

    expect(deriveJobTrackCurrentNext({ ...base, lifecycle: "planned", endedAt: null, endReason: null }, new Date())).toMatchObject({ state: "planned", title: "等待投递" });
    expect(deriveJobTrackCurrentNext({ ...base, lifecycle: "ended", endedAt: "2026-09-01T00:00:00.000Z", endReason: "withdrawn" }, new Date())).toMatchObject({ state: "ended", title: "已主动结束" });
  });

  it("已过去面试的准备任务不再作为下一步行动", () => {
    const view = deriveJobTrackCurrentNext(
      {
        lifecycle: "active",
        submittedAt: "2026-08-20T00:00:00.000Z",
        endedAt: null,
        endReason: null,
        lastProgressAt: "2026-08-31T04:00:00.000Z",
        assessments: [],
        interviews: [{
          id: "interview-past",
          roundLabel: "一面",
          interviewType: "技术面",
          startAt: "2026-08-31T02:00:00.000Z",
          endAt: "2026-08-31T03:00:00.000Z",
          status: "scheduled",
          occurredAt: "2026-08-31T03:00:00.000Z",
          reviewedAt: null,
        }],
        tasks: [{
          id: "prep-past",
          interviewId: "interview-past",
          kind: "interview_prep",
          title: "准备一面",
          deadlineAt: null,
          completedAt: null,
          cancelledAt: null,
        }],
      },
      new Date("2026-09-01T04:00:00.000Z"),
    );

    expect(view.state).toBe("waiting");
  });
});

describe("markCalendarConflicts", () => {
  it("两个有时长的日程重叠时标记冲突，Deadline 点事项不误报", () => {
    const result = markCalendarConflicts([
      { id: "i1", sourceType: "interview", jobTrackId: "j1", companyName: "A", roleName: "R", title: "一面", startAt: "2026-09-08T02:00:00.000Z", endAt: "2026-09-08T03:00:00.000Z", isDeadline: false, hasConflict: false },
      { id: "i2", sourceType: "assessment", jobTrackId: "j2", companyName: "B", roleName: "R", title: "笔试", startAt: "2026-09-08T02:30:00.000Z", endAt: "2026-09-08T04:00:00.000Z", isDeadline: false, hasConflict: false },
      { id: "d1", sourceType: "task", jobTrackId: "j1", companyName: "A", roleName: "R", title: "截止", startAt: "2026-09-08T02:15:00.000Z", endAt: null, isDeadline: true, hasConflict: false },
    ]);
    expect(result.map((item) => item.hasConflict)).toEqual([true, true, false]);
  });
});

describe("sortDashboardActionItems", () => {
  it("所有逾期行动都排在待复盘等普通行动之前，同级再按时间排序", () => {
    const base = { jobTrackId: "job-1", companyName: "A", roleName: "R" };
    const result = sortDashboardActionItems([
      { ...base, id: "review-old", sourceType: "interview_review", title: "复盘一面", dueAt: "2026-08-20T00:00:00.000Z", overdue: false },
      { ...base, id: "overdue-later", sourceType: "task", title: "提交材料", dueAt: "2026-08-31T00:00:00.000Z", overdue: true },
      { ...base, id: "overdue-earlier", sourceType: "assessment", title: "在线测评", dueAt: "2026-08-30T00:00:00.000Z", overdue: true },
    ]);

    expect(result.map((item) => item.id)).toEqual(["overdue-earlier", "overdue-later", "review-old"]);
  });
});

describe("findImminentInterviewPreparationTasks", () => {
  it("只把明日硬事件前仍开放的面试准备任务加入行动队列", () => {
    const tasks = [
      { id: "include", kind: "interview_prep", interviewId: "tomorrow", completedAt: null, cancelledAt: null },
      { id: "completed", kind: "interview_prep", interviewId: "tomorrow", completedAt: "2026-09-01T00:00:00.000Z", cancelledAt: null },
      { id: "far", kind: "interview_prep", interviewId: "next-week", completedAt: null, cancelledAt: null },
      { id: "generic", kind: "generic", interviewId: null, completedAt: null, cancelledAt: null },
    ] as const;
    const interviews = [
      { id: "tomorrow", status: "scheduled", startAt: "2026-09-03T02:00:00.000Z" },
      { id: "next-week", status: "scheduled", startAt: "2026-09-08T02:00:00.000Z" },
    ] as const;

    const result = findImminentInterviewPreparationTasks(
      tasks,
      interviews,
      new Date("2026-09-02T04:00:00.000Z"),
      new Date("2026-09-03T15:59:59.999Z"),
    );

    expect(result.map((item) => item.task.id)).toEqual(["include"]);
    expect(result[0]?.dueAt).toBe("2026-09-03T02:00:00.000Z");
  });
});
