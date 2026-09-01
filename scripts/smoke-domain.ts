import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { getDatabaseRuntime } from "../src/db/runtime";
import { commitFaqBatch, createExperience, setResumeExperiences } from "../src/modules/interview-knowledge/service";
import { getExperienceDetail, getInterviewKnowledgeDetail } from "../src/modules/interview-knowledge/queries";
import { getJobWorkflow } from "../src/modules/job-workflow/composition";
import { uploadResumeVersion } from "../src/modules/resume-library/service";
import { stageTranscriptAsset } from "../src/modules/transcript-assets/service";
import { getWorkspaceQueries } from "../src/modules/workspace-queries/composition";

config({ path: [".env.local", ".env"] });

const userId = process.env.APP_USER_ID;
if (!userId) throw new Error("APP_USER_ID is required");
const actor = { userId };

try {
  const now = new Date();
  const workflow = getJobWorkflow();
  const resume = await uploadResumeVersion({
    userId,
    name: "CI 集成验证简历",
    file: new File(["%PDF-1.4\nCI smoke resume"], "ci-smoke-resume.pdf", { type: "application/pdf" }),
  });
  const experience = await createExperience({ userId, name: "CI 集成验证项目", content: "用于验证 Resume → Experience → FAQ 的真实数据库链路。" });
  await setResumeExperiences({ userId, resumeId: resume.id, experienceIds: [experience.id] });

  const created = await workflow.execute({
    type: "create_job_track",
    idempotencyKey: randomUUID(),
    companyName: "CI 验证公司",
    roleName: "全流程验证岗位",
    jobDescription: { text: "负责验证求职全流程管理产品的真实依赖链路。" },
    jobUrl: "https://example.com/ci-smoke-job",
  }, actor);
  await workflow.execute({
    type: "submit_application",
    idempotencyKey: randomUUID(),
    jobTrackId: created.jobTrack.id,
    resumeId: resume.id,
    submittedAt: isoOffset(now, -48),
  }, actor);

  const assessment = await workflow.execute({
    type: "record_assessment_invite",
    idempotencyKey: randomUUID(),
    jobTrackId: created.jobTrack.id,
    assessmentKind: "assessment",
    title: "CI 在线测评",
    timing: { type: "deadline", deadlineAt: isoOffset(now, 12) },
    receivedAt: isoOffset(now, -24),
  }, actor);
  await workflow.execute({
    type: "complete_assessment",
    idempotencyKey: randomUUID(),
    assessmentId: assessment.assessment.id,
    completedAt: isoOffset(now, -4),
  }, actor);

  const pastInterview = await workflow.execute({
    type: "schedule_interview",
    idempotencyKey: randomUUID(),
    jobTrackId: created.jobTrack.id,
    sequenceNo: 1,
    roundLabel: "一面",
    interviewType: "技术面",
    startAt: isoOffset(now, -3),
    endAt: isoOffset(now, -2),
    receivedAt: isoOffset(now, -36),
  }, actor);
  const transcript = await stageTranscriptAsset({
    userId,
    interviewId: pastInterview.interview.id,
    file: new File(["CI interview transcript"], "ci-transcript.txt", { type: "text/plain" }),
  });
  await workflow.execute({
    type: "save_interview_transcript",
    idempotencyKey: randomUUID(),
    interviewId: pastInterview.interview.id,
    transcriptText: "CI 面试转录文本",
    transcriptAssetId: transcript.id,
    savedAt: isoOffset(now, -1),
  }, actor);
  await commitFaqBatch({
    userId,
    idempotencyKey: randomUUID(),
    interviewId: pastInterview.interview.id,
    committedAt: isoOffset(now, -1),
    items: [{
      question: "这条集成链路验证了什么？",
      answer: "验证 FAQ 能从 Interview 沉淀到 Experience，并在下一场面试前复用。",
      kind: "experience",
      category: "技术实现",
      experienceId: experience.id,
    }],
  });

  const futureInterview = await workflow.execute({
    type: "schedule_interview",
    idempotencyKey: randomUUID(),
    jobTrackId: created.jobTrack.id,
    sequenceNo: 2,
    roundLabel: "二面",
    interviewType: "视频面试",
    startAt: isoOffset(now, 20),
    endAt: isoOffset(now, 21),
    receivedAt: now.toISOString(),
  }, actor);
  const preparation = await workflow.execute({
    type: "create_task",
    idempotencyKey: randomUUID(),
    jobTrackId: created.jobTrack.id,
    interviewId: futureInterview.interview.id,
    kind: "interview_prep",
    title: "复习 CI 项目 FAQ",
  }, actor);

  const queries = getWorkspaceQueries();
  const [dashboard, calendar, detail, interviewDetail, experienceDetail] = await Promise.all([
    queries.read({ type: "get_dashboard", now: now.toISOString() }, actor),
    queries.read({ type: "get_calendar_week", startAt: isoOffset(now, -6), endAt: isoOffset(now, 48) }, actor),
    queries.read({ type: "get_job_track_detail", jobTrackId: created.jobTrack.id }, actor),
    getInterviewKnowledgeDetail(userId, pastInterview.interview.id),
    getExperienceDetail(userId, experience.id),
  ]);

  assert.equal(detail.selectedResume?.id, resume.id);
  assert.equal(detail.selectedResumeExperiences[0]?.id, experience.id);
  assert.equal(detail.selectedResumeExperiences[0]?.faqCount, 1);
  assert.ok(detail.events.some((event) => event.kind === "ApplicationSubmitted"));
  assert.ok(detail.events.some((event) => event.kind === "AssessmentCompleted"));
  assert.ok(detail.events.some((event) => event.kind === "InterviewOccurred"));
  assert.ok(dashboard.todayItems.some((item) => item.id === preparation.task.id));
  assert.ok(dashboard.todayItems.some((item) => item.id === pastInterview.interview.id && item.sourceType === "interview_review"));
  assert.ok(calendar.items.some((item) => item.id === futureInterview.interview.id));
  assert.equal(interviewDetail.interview.transcriptAssetId, transcript.id);
  assert.equal(interviewDetail.faqs.length, 1);
  assert.equal(experienceDetail.faqs.length, 1);
  console.log("Real PostgreSQL + object-storage domain smoke test passed");
} finally {
  await getDatabaseRuntime().close();
}

function isoOffset(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}
