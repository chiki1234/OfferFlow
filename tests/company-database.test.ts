import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDatabaseRuntime } from "@/db/runtime";
import { assets, assessments, events, faqImportBatches, interviews, jobTracks, resumes, tasks, users } from "@/db/schema";
import { getJobWorkflow } from "@/modules/job-workflow/composition";
import { getWorkspaceQueries } from "@/modules/workspace-queries/composition";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

describe.skipIf(process.env.COMPANY_INTEGRATION !== "1")("岗位与工作台数据库验收", () => {
  const actor = { userId: randomUUID() };
  const now = "2026-09-09T04:00:00Z";
  beforeAll(async () => { config({path:[".env.local",".env"],quiet:true}); await getDatabaseRuntime().db.insert(users).values({id:actor.userId,name:"隔离验收",email:`${actor.userId}@example.invalid`}); });
  afterAll(async () => { await getDatabaseRuntime().db.delete(users).where(eq(users.id,actor.userId)); await getDatabaseRuntime().close(); vi.unstubAllEnvs(); });
  it("多岗位表单实际保存各自简历与当前投递时间，重复提交不重复建档", async () => {
    vi.stubEnv("AUTH_MODE", "local"); vi.stubEnv("APP_USER_ID", actor.userId);
    const resumeIds = [randomUUID(), randomUUID()];
    for (const id of resumeIds) {
      const assetId = randomUUID();
      await getDatabaseRuntime().db.insert(assets).values({ id: assetId, userId: actor.userId, kind: "resume", storageKey: `isolated-test/${assetId}`, originalName: "test.pdf", mimeType: "application/pdf", sizeBytes: 1 });
      await getDatabaseRuntime().db.insert(resumes).values({ id, userId: actor.userId, name: id, assetId });
    }
    const form = new FormData();
    form.set("idempotencyKey", randomUUID()); form.set("companyName", "表单验收公司"); form.set("creationMode", "active");
    resumeIds.forEach((resumeId, index) => {
      form.append("roleKeys", String(index));
      for (const [key, value] of Object.entries({ roleName: `岗位${index}`, preferenceRank: String(index + 1), jobDescription: "JD", jobUrl: "", resumeMode: "existing", resumeId })) form.set(`roles.${index}.${key}`, value);
    });
    const action = (await import("@/app/jobs/actions")).createJobTrackAction;
    const before = Date.now();
    expect(await action({error:null,success:null},form)).toEqual({error:null,success:"岗位已全部保存。"});
    expect(await action({error:null,success:null},form)).toEqual({error:null,success:"岗位已全部保存。"});
    const list = await getWorkspaceQueries().read({type:"list_job_tracks",lifecycle:"active"},actor);
    const saved = list.items.filter(job=>job.companyName === "表单验收公司");
    expect(saved).toHaveLength(2);
    for (const job of saved) {
      expect(new Date(job.submittedAt!).getTime()).toBeGreaterThanOrEqual(before);
      const detail = await getWorkspaceQueries().read({type:"get_job_track_detail",jobTrackId:job.id},actor);
      expect(detail.selectedResume?.id).toBe(resumeIds[job.preferenceRank! - 1]);
    }
  });
  it("新增失败返回精确字段错误，修正后同一提交标识可保存且重复提交不重复建档", async () => {
    vi.stubEnv("AUTH_MODE", "local"); vi.stubEnv("APP_USER_ID", actor.userId);
    const action = (await import("@/app/jobs/actions")).createJobTrackAction;
    const form = new FormData();
    form.set("idempotencyKey", randomUUID()); form.set("companyName", "错误保留验收"); form.set("creationMode", "planned");
    form.append("roleKeys", "4");
    for (const [key, value] of Object.entries({ roleName: " ", preferenceRank: "1", jobDescription: "", jobUrl: "bad" })) form.set(`roles.4.${key}`, value);
    const invalid = await action({ error: null, success: null }, form);
    expect(Object.keys(invalid.fieldErrors ?? {}).sort()).toEqual(["roles.4.jobDescription", "roles.4.jobDescriptionImages", "roles.4.jobUrl", "roles.4.roleName"]);
    form.set("roles.4.roleName", "岗位"); form.set("roles.4.jobDescription", "JD"); form.set("roles.4.jobUrl", "");
    expect((await action(invalid, form)).success).toBeTruthy();
    const conflicting = new FormData();
    for (const [key, value] of form) conflicting.append(key, value);
    conflicting.set("idempotencyKey", randomUUID());
    const conflict = await action({ error: null, success: null }, conflicting);
    expect(Object.keys(conflict.fieldErrors ?? {})).toEqual(["roles.4.preferenceRank"]);
    conflicting.set("roles.4.preferenceRank", "2");
    expect((await action(conflict, conflicting)).success).toBeTruthy();
    expect((await action(conflict, conflicting)).success).toBeTruthy();
    const saved = await getDatabaseRuntime().db.select().from(jobTracks).where(eq(jobTracks.userId, actor.userId));
    expect(saved.filter(job => job.companyName === "错误保留验收")).toHaveLength(2);
    for (const job of saved.filter(job => job.companyName === "错误保留验收")) await getDatabaseRuntime().db.delete(jobTracks).where(eq(jobTracks.id, job.id));
  });
  it("未截止和无截止待办、未来测评、今天及跨天面试不遗漏，明天起七天去重", async () => {
    const workflow = getJobWorkflow();
    const query = getWorkspaceQueries();
    const created = await workflow.execute({type:"quick_import_job_tracks",idempotencyKey:randomUUID(),lifecycle:"active",entries:[{companyName:"验收公司",roleName:"岗位"}]},actor);
    const jobTrackId = created.jobTracks[0].id;
    const task = await workflow.execute({type:"create_task",idempotencyKey:randomUUID(),kind:"generic",title:"未来待办",deadlineAt:"2026-09-13T00:00:00Z"},actor);
    const undated = await workflow.execute({type:"create_task",idempotencyKey:randomUUID(),kind:"generic",title:"无日期"},actor);
    const assessment = await workflow.execute({type:"record_assessment_invite",idempotencyKey:randomUUID(),jobTrackId,assessmentKind:"written_test",title:"未来笔试",assessmentUrl:"https://example.com/test",timing:{type:"deadline",deadlineAt:"2026-09-14T00:00:00Z"},receivedAt:now},actor);
    const schedule = (startAt:string,endAt:string) => workflow.execute({type:"schedule_interview",idempotencyKey:randomUUID(),jobTrackId,roundLabel:"面试",timing:{type:"fixed_slot",startAt,endAt},receivedAt:now},actor);
    const today = await schedule("2026-09-09T05:00:00Z","2026-09-09T06:00:00Z");
    const crossing = await schedule("2026-09-08T15:00:00Z","2026-09-09T06:00:00Z");
    const tomorrow = await schedule("2026-09-09T16:00:00Z","2026-09-09T17:00:00Z");
    const last = await schedule("2026-09-16T15:00:00Z","2026-09-16T15:59:00Z");
    const outside = await schedule("2026-09-16T16:00:00Z","2026-09-16T17:00:00Z");
    const view = await query.read({type:"get_dashboard",now},actor);
    const todayIds = view.todayItems.map(item=>item.id);
    for (const id of [undated.task.id,today.interview.id,crossing.interview.id]) expect(todayIds).toContain(id);
    expect(view.upcomingItems.find(item=>item.id===assessment.assessment.id)?.externalUrl).toBe("https://example.com/test");
    expect(view.upcomingItems.map(item=>item.id).sort()).toEqual([task.task.id,assessment.assessment.id,tomorrow.interview.id,last.interview.id].sort());
    expect(view.upcomingItems.some(item=>item.id===outside.interview.id)).toBe(false);
    const changed = await workflow.execute({type:"update_assessment",idempotencyKey:randomUUID(),assessmentId:assessment.assessment.id,title:"固定笔试",assessmentKind:"written_test",assessmentUrl:"https://example.com/edited",timing:{type:"fixed_slot",startAt:"2026-09-14T00:00:00Z",endAt:"2026-09-14T01:00:00Z"}},actor);
    expect(changed.task).toBeNull();
    const detail = await query.read({type:"get_job_track_detail",jobTrackId},actor);
    expect(detail.assessments[0]).toMatchObject({assessmentUrl:"https://example.com/edited",title:"固定笔试"});
    expect(detail.tasks.some(item=>item.assessmentId===assessment.assessment.id)).toBe(false);
    await workflow.execute({type:"delete_task",idempotencyKey:randomUUID(),taskId:task.task.id},actor);
    expect((await query.read({type:"get_dashboard",now},actor)).todayItems.some(item=>item.id===task.task.id)).toBe(false);
  },30000);
  it("志愿持久化，同公司唯一性校验且批量创建失败回滚",async()=>{
    const workflow=getJobWorkflow(); const query=getWorkspaceQueries();
    const entry={roleName:"一志愿",preferenceRank:1,jobDescription:{text:"JD"}};
    const command={type:"create_company_jobs" as const,idempotencyKey:randomUUID(),companyName:"Rank Company",lifecycle:"planned" as const,entries:[entry,{...entry,roleName:"二志愿",preferenceRank:2}]};
    const result=await workflow.execute(command,actor);
    expect((await query.read({type:"get_job_track_detail",jobTrackId:result.jobTracks[1].id},actor)).jobTrack.preferenceRank).toBe(2);
    await expect(workflow.execute({...command,idempotencyKey:randomUUID(),companyName:"rank company",entries:[{...entry,preferenceRank:3},entry]},actor)).rejects.toThrow("志愿不能重复");
    const list=await query.read({type:"list_job_tracks",lifecycle:"planned"},actor);
    expect(list.items).toHaveLength(2);
  });
  it("三种状态岗位均可删除，并级联清除岗位记录和解除 FAQ 导入来源", async () => {
    const workflow = getJobWorkflow();
    const create = (lifecycle: "planned" | "active", roleName: string) => workflow.execute({
      type: "quick_import_job_tracks", idempotencyKey: randomUUID(), lifecycle,
      entries: [{ companyName: "删除验收公司", roleName }],
    }, actor);

    const planned = await create("planned", "待投递岗位");
    await expect(workflow.execute({ type: "delete_job_track", idempotencyKey: randomUUID(), jobTrackId: planned.jobTracks[0].id }, actor)).resolves.toMatchObject({ outcome: "job_track_deleted" });

    const active = await create("active", "进行中岗位");
    const activeId = active.jobTracks[0].id;
    const assessment = await workflow.execute({ type: "record_assessment_invite", idempotencyKey: randomUUID(), jobTrackId: activeId, assessmentKind: "written_test", title: "笔试", timing: { type: "deadline", deadlineAt: "2026-09-20T00:00:00Z" }, receivedAt: now }, actor);
    const interview = await workflow.execute({ type: "schedule_interview", idempotencyKey: randomUUID(), jobTrackId: activeId, roundLabel: "一面", timing: { type: "fixed_slot", startAt: "2026-09-20T01:00:00Z", endAt: "2026-09-20T02:00:00Z" }, receivedAt: now }, actor);
    const batchId = randomUUID();
    await getDatabaseRuntime().db.insert(faqImportBatches).values({
      id: batchId, userId: actor.userId, idempotencyKey: randomUUID(), sourceInterviewId: interview.interview.id, status: "pending",
      items: [{ id: randomUUID(), question: "问题", answer: "", binding: "unbound", category: null, experienceId: null, sourceInterviewId: interview.interview.id }],
    });
    await expect(workflow.execute({ type: "delete_job_track", idempotencyKey: randomUUID(), jobTrackId: activeId }, actor)).resolves.toMatchObject({ outcome: "job_track_deleted" });
    const database = getDatabaseRuntime().db;
    expect((await database.select().from(jobTracks).where(eq(jobTracks.id, activeId))).length).toBe(0);
    expect((await database.select().from(assessments).where(eq(assessments.jobTrackId, activeId))).length).toBe(0);
    expect((await database.select().from(interviews).where(eq(interviews.jobTrackId, activeId))).length).toBe(0);
    expect((await database.select().from(tasks).where(eq(tasks.jobTrackId, activeId))).length).toBe(0);
    expect((await database.select().from(events).where(eq(events.jobTrackId, activeId))).length).toBe(0);
    const [batch] = await getDatabaseRuntime().db.select().from(faqImportBatches).where(eq(faqImportBatches.id, batchId));
    expect(batch.sourceInterviewId).toBeNull();
    expect(batch.items[0].sourceInterviewId).toBeNull();
    expect(assessment.task).not.toBeNull();

    const ended = await create("active", "已结束岗位");
    await workflow.execute({ type: "end_job_track", idempotencyKey: randomUUID(), jobTrackId: ended.jobTracks[0].id, reason: "other", occurredAt: now }, actor);
    await expect(workflow.execute({ type: "delete_job_track", idempotencyKey: randomUUID(), jobTrackId: ended.jobTracks[0].id }, actor)).resolves.toMatchObject({ outcome: "job_track_deleted" });
  }, 30000);
});
