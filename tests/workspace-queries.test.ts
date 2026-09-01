import { describe, expect, it } from "vitest";
import { deriveJobTrackStatus } from "@/modules/workspace-queries/derive-job-track-status";
import { markCalendarConflicts } from "@/modules/workspace-queries/calendar-conflicts";

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
