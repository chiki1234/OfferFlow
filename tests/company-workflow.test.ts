import { describe, expect, it } from "vitest";
import { createInMemoryJobWorkflow } from "@/modules/job-workflow/in-memory";
import { calendarRange, itemsForDay } from "@/modules/workspace-queries/calendar-range";
import { deriveJobTrackStatus } from "@/modules/workspace-queries/derive-job-track-status";

const actor = { userId: "owner" };
function setup() { return createInMemoryJobWorkflow({ resumes: [{ id: "resume-a", userId: actor.userId }, { id: "resume-b", userId: actor.userId }] }); }
const entry = (rank: number, resumeId = "resume-a") => ({ roleName: `岗位 ${rank}`, preferenceRank: rank, jobDescription: { text: "岗位说明" }, resumeId });

describe("同公司独立岗位", () => {
  it.each(["planned", "active"] as const)("%s 岗位可不填写 JD，后续编辑仍可保存", async lifecycle => {
    const workflow = setup();
    const result = await workflow.execute({ type: "create_company_jobs", idempotencyKey: `empty-jd-${lifecycle}`, companyName: "公司", lifecycle, entries: [{ ...entry(1), jobDescription: {} }] }, actor);
    const job = result.jobTracks[0];
    expect(job).toMatchObject({ lifecycle, resumeId: lifecycle === "active" ? "resume-a" : null });
    await expect(workflow.execute({ type: "update_job_track_context", idempotencyKey: `edit-empty-${lifecycle}`, jobTrackId: job.id, version: job.version, companyName: "公司", roleName: "更新岗位", jobDescription: {} }, actor)).resolves.toMatchObject({ jobTrack: { roleName: "更新岗位" } });
  });
  it("原子保存两个志愿，各用自己的简历，重试不重复创建", async () => {
    const workflow = setup();
    const command = { type: "create_company_jobs" as const, idempotencyKey: "batch-one", companyName: "公司", lifecycle: "active" as const, entries: [entry(1), entry(2,"resume-b")] };
    const result = await workflow.execute(command, actor);
    expect(result.jobTracks.map(job => [job.preferenceRank, job.resumeId, job.lifecycle])).toEqual([[1,"resume-a","active"],[2,"resume-b","active"]]);
    expect(await workflow.execute(command,actor)).toEqual(result);
  });
  it("失败全部回滚；同公司志愿不可重复，其他用户互不影响", async () => {
    const workflow = setup();
    const command = { type: "create_company_jobs" as const, idempotencyKey: "batch-bad", companyName: " Company ", lifecycle: "active" as const, entries: [entry(1),entry(2,"missing")] };
    await expect(workflow.execute(command,actor)).rejects.toThrow("NOT_FOUND");
    await workflow.execute({ ...command, idempotencyKey: "batch-good", entries: [entry(1)] },actor);
    await expect(workflow.execute({ ...command, idempotencyKey: "duplicate", companyName: "company", entries: [entry(1)] },actor)).rejects.toThrow("志愿不能重复");
    await expect(workflow.execute({ ...command, idempotencyKey: "other-user", lifecycle: "planned", entries: [entry(1)] },{userId:"other"})).resolves.toMatchObject({ outcome: "company_jobs_created" });
  });
});

describe("测评编辑和待办删除", () => {
  it("切换时间类型同步待办，编辑完成的测评不恢复待完成状态", async () => {
    const workflow = setup();
    const jobs = await workflow.execute({ type:"create_company_jobs", idempotencyKey:"jobs", companyName:"公司", lifecycle:"active", entries:[entry(1)] },actor);
    const recorded = await workflow.execute({ type:"record_assessment_invite", idempotencyKey:"assessment", jobTrackId:jobs.jobTracks[0].id, assessmentKind:"assessment", title:"测评", timing:{type:"fixed_slot",startAt:"2026-09-10T10:00:00Z",endAt:"2026-09-10T11:00:00Z"}, receivedAt:"2026-09-09T10:00:00Z" },actor);
    const update = { type:"update_assessment" as const, idempotencyKey:"edit", assessmentId:recorded.assessment.id, title:"笔试", assessmentKind:"written_test" as const, assessmentUrl:"https://example.com/test", timing:{type:"deadline" as const, deadlineAt:"2026-09-12T10:00:00Z"} };
    const edited = await workflow.execute(update,actor);
    expect(edited.task).toMatchObject({title:"笔试",deadlineAt:"2026-09-12T10:00:00.000Z"});
    expect(edited.assessment.assessmentUrl).toBe("https://example.com/test");
    await expect(workflow.execute({...update,idempotencyKey:"foreign"},{userId:"other"})).rejects.toThrow("NOT_FOUND");
    await expect(workflow.execute({...update,idempotencyKey:"bad-url",assessmentUrl:"javascript:alert(1)"},actor)).rejects.toThrow("VALIDATION_ERROR");
    await workflow.execute({type:"complete_assessment",idempotencyKey:"complete",assessmentId:recorded.assessment.id,completedAt:"2026-09-11T10:00:00Z"},actor);
    const fixed = await workflow.execute({...update,idempotencyKey:"fixed",timing:{type:"fixed_slot",startAt:"2026-09-12T10:00:00Z",endAt:"2026-09-12T11:00:00Z"}},actor);
    expect(fixed.task).toBeNull(); expect(fixed.assessment.status).toBe("completed");
    const again = await workflow.execute({...update,idempotencyKey:"again"},actor);
    expect(again.task?.completedAt).toBe("2026-09-11T10:00:00.000Z");
  });
  it("已完成待办也可删除，删除幂等且校验所有者", async () => {
    const workflow = setup();
    const created = await workflow.execute({type:"create_task",idempotencyKey:"task",kind:"generic",title:"待办"},actor);
    const command = {type:"delete_task" as const,idempotencyKey:"delete",taskId:created.task.id};
    await expect(workflow.execute(command,{userId:"other"})).rejects.toThrow("NOT_FOUND");
    await workflow.execute({type:"complete_task",idempotencyKey:"done",taskId:created.task.id,completedAt:"2026-09-09T10:00:00Z"},actor);
    const deleted = await workflow.execute(command,actor);
    expect(await workflow.execute(command,actor)).toEqual(deleted);
    await expect(workflow.execute({...command,idempotencyKey:"delete-again"},actor)).rejects.toThrow("NOT_FOUND");
  });
});

describe("日期与关注边界", () => {
  it("月历补齐首尾周，周一开始，跨年切换正确", () => {
    const range = calendarRange(new Date("2026-09-09T00:00:00Z"),"2026-09-09","month");
    expect(range.first).toBe("2026-08-31"); expect(range.days % 7).toBe(0);
    expect(calendarRange(new Date(),"2026-12-31","month").next).toBe("2027-01-01");
    expect(calendarRange(new Date(),"2026-09-09","week").first).toBe("2026-09-07");
  });
  it("跨天事项覆盖两天，但不包含结束时刻所在的下一天", () => {
    const items = [{id:"i",sourceType:"interview" as const,jobTrackId:"j",companyName:"公司",roleName:"岗位",title:"面试",startAt:"2026-09-08T15:00:00Z",endAt:"2026-09-09T16:00:00Z",isDeadline:false,hasConflict:false}];
    expect(itemsForDay(items,"2026-09-08")).toHaveLength(1);
    expect(itemsForDay(items,"2026-09-09")).toHaveLength(1);
    expect(itemsForDay(items,"2026-09-10")).toHaveLength(0);
  });
  it("无进展投递满五天提醒，新的进展重新计时", () => {
    const facts = {lifecycle:"active" as const,submittedAt:"2026-09-01T00:00:00Z",assessments:[],interviews:[],tasks:[]};
    expect(deriveJobTrackStatus(facts,new Date("2026-09-05T23:59:59Z")).attentionFlags).toEqual([]);
    expect(deriveJobTrackStatus(facts,new Date("2026-09-06T00:00:00Z")).attentionFlags).toEqual(["waiting_long"]);
    expect(deriveJobTrackStatus({...facts,lastProgressAt:"2026-09-05T00:00:00Z"},new Date("2026-09-06T00:00:00Z")).attentionFlags).toEqual([]);
  });
});
