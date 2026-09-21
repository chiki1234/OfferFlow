import { describe, it, expect } from "vitest";
import { createInMemoryJobWorkflow } from "@/modules/job-workflow/in-memory";
const actor = { userId: "owner" };
describe("待办时间和投递信息更正", () => {
  it("固定时段可切回 Deadline、无时间；拒绝矛盾和倒置时间", async () => {
    const workflow = createInMemoryJobWorkflow();
    const command = { type: "create_task" as const, idempotencyKey: "fixed", kind: "generic" as const, title: "准备", startAt: "2026-09-09T03:00:00Z", endAt: "2026-09-09T04:00:00Z" };
    const { task } = await workflow.execute(command, actor);
    expect(task).toMatchObject({ deadlineAt: null, startAt: "2026-09-09T03:00:00.000Z" });
    await expect(workflow.execute({ ...command, idempotencyKey: "bad", endAt: command.startAt }, actor)).rejects.toThrow("结束时间");
    await expect(workflow.execute({ ...command, idempotencyKey: "mixed", deadlineAt: command.endAt }, actor)).rejects.toThrow("不能同时");
    const updated = await workflow.execute({ type: "update_task", idempotencyKey: "deadline", taskId: task.id, title: task.title, deadlineAt: command.endAt }, actor);
    expect(updated.task).toMatchObject({ startAt: null, endAt: null, deadlineAt: "2026-09-09T04:00:00.000Z" });
    expect((await workflow.execute({ type: "update_task", idempotencyKey: "none", taskId: task.id, title: task.title }, actor)).task.deadlineAt).toBeNull();
    await expect(workflow.execute({ type: "update_task", idempotencyKey: "foreign", taskId: task.id, title: "x" }, { userId: "other" })).rejects.toThrow("NOT_FOUND");
  });
  it("岗位部门与投递更正保持幂等、版本检查和简历所有权", async () => {
    const workflow = createInMemoryJobWorkflow({ resumes: [{ id: "resume", userId: actor.userId }] });
    const { jobTracks } = await workflow.execute({ type: "create_company_jobs", idempotencyKey: "create", companyName: "公司", lifecycle: "active", entries: [{ roleName: "岗位", department: "部门甲", resumeId: "resume", jobDescription: { text: "JD" } }] }, actor);
    const job = jobTracks[0];
    expect(job.department).toBe("部门甲");
    const command = { type: "update_job_track_context" as const, idempotencyKey: "edit", jobTrackId: job.id, version: job.version, companyName: "公司", roleName: "岗位", department: "部门乙", lifecycle: "planned" as const, jobDescription: { text: "JD" } };
    const result = await workflow.execute(command, actor);
    expect(result.jobTrack).toMatchObject({ lifecycle: "planned", submittedAt: null, department: "部门乙", resumeId: "resume" });
    expect(await workflow.execute(command, actor)).toEqual(result);
    await expect(workflow.execute({ ...command, idempotencyKey: "stale" }, actor)).rejects.toThrow("CONFLICT");
    const next = { ...command, version: result.jobTrack.version, idempotencyKey: "resubmit", lifecycle: "active" as const, submittedAt: "2026-09-08T02:00:00Z" };
    await expect(workflow.execute({ ...next, resumeId: "foreign" }, actor)).rejects.toThrow("NOT_FOUND");
    expect((await workflow.execute(next, actor)).jobTrack.submittedAt).toBe("2026-09-08T02:00:00.000Z");
  });
});
