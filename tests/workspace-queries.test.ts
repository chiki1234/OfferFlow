import { describe, expect, it } from "vitest";
import { deriveJobTrackStatus } from "@/modules/workspace-queries/derive-job-track-status";

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
