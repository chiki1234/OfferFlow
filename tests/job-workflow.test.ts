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
});
