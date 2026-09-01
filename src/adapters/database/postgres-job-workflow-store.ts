import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  actionReceipts,
  assessments,
  events,
  interviews,
  jobDescriptions,
  jobTracks,
  resumes,
  tasks,
} from "@/db/schema";
import type {
  AssessmentView,
  InterviewView,
  JobCommandResult,
  JobEventView,
  TaskView,
} from "@/modules/job-workflow/interface";
import type {
  JobWorkflowStore,
  JobWorkflowTransaction,
  StoredJobTrack,
} from "@/modules/job-workflow/store";

export function createPostgresJobWorkflowStore(db: AppDatabase): JobWorkflowStore {
  return {
    transaction<T>(work: (transaction: JobWorkflowTransaction) => Promise<T>): Promise<T> {
      return db.transaction(async (databaseTransaction) => {
        const loadJobTrack = async (
          userId: string,
          jobTrackId: string,
        ): Promise<StoredJobTrack | null> => {
          const [row] = await databaseTransaction
            .select({
              id: jobTracks.id,
              userId: jobTracks.userId,
              companyName: jobTracks.companyName,
              roleName: jobTracks.roleName,
              lifecycle: jobTracks.lifecycle,
              jobUrl: jobTracks.jobUrl,
              resumeId: jobTracks.resumeId,
              submittedAt: jobTracks.submittedAt,
              createdAt: jobTracks.createdAt,
              createdVia: jobTracks.createdVia,
              version: jobTracks.version,
              descriptionText: jobDescriptions.textContent,
            })
            .from(jobTracks)
            .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
            .where(and(eq(jobTracks.id, jobTrackId), eq(jobTracks.userId, userId)))
            .limit(1);

          return row
            ? {
                id: row.id,
                userId: row.userId,
                companyName: row.companyName,
                roleName: row.roleName,
                lifecycle: row.lifecycle,
                jobUrl: row.jobUrl,
                resumeId: row.resumeId,
                submittedAt: row.submittedAt?.toISOString() ?? null,
                createdAt: row.createdAt.toISOString(),
                createdVia: row.createdVia,
                version: row.version,
                jobDescription: {
                  text: row.descriptionText,
                  imageAssetIds: [],
                },
              }
            : null;
        };

        const loadAssessmentWithTask = async (
          userId: string,
          assessmentId: string,
        ): Promise<{ assessment: AssessmentView; task: TaskView | null } | null> => {
          const [row] = await databaseTransaction
            .select({
              assessmentId: assessments.id,
              jobTrackId: assessments.jobTrackId,
              assessmentKind: assessments.kind,
              assessmentTitle: assessments.title,
              timingType: assessments.timingType,
              deadlineAt: assessments.deadlineAt,
              startAt: assessments.startAt,
              endAt: assessments.endAt,
              assessmentStatus: assessments.status,
              assessmentCompletedAt: assessments.completedAt,
              assessmentCancelledAt: assessments.cancelledAt,
              taskId: tasks.id,
              taskKind: tasks.kind,
              taskInterviewId: tasks.interviewId,
              taskTitle: tasks.title,
              taskDeadlineAt: tasks.deadlineAt,
              taskCompletedAt: tasks.completedAt,
              taskCancelledAt: tasks.cancelledAt,
            })
            .from(assessments)
            .innerJoin(jobTracks, eq(jobTracks.id, assessments.jobTrackId))
            .leftJoin(tasks, eq(tasks.assessmentId, assessments.id))
            .where(
              and(eq(assessments.id, assessmentId), eq(jobTracks.userId, userId)),
            )
            .limit(1);

          if (!row) {
            return null;
          }
          const timing: AssessmentView["timing"] = row.timingType === "deadline"
            ? {
                type: "deadline",
                deadlineAt: requireDate(row.deadlineAt, "assessment.deadlineAt").toISOString(),
              }
            : {
                type: "fixed_slot",
                startAt: requireDate(row.startAt, "assessment.startAt").toISOString(),
                endAt: requireDate(row.endAt, "assessment.endAt").toISOString(),
              };
          const task: TaskView | null = row.taskId && row.taskKind && row.taskTitle
            ? {
                id: row.taskId,
                jobTrackId: row.jobTrackId,
                interviewId: row.taskInterviewId,
                assessmentId: row.assessmentId,
                kind: row.taskKind,
                title: row.taskTitle,
                deadlineAt: row.taskDeadlineAt?.toISOString() ?? null,
                completedAt: row.taskCompletedAt?.toISOString() ?? null,
                cancelledAt: row.taskCancelledAt?.toISOString() ?? null,
              }
            : null;

          return {
            assessment: {
              id: row.assessmentId,
              jobTrackId: row.jobTrackId,
              kind: row.assessmentKind,
              title: row.assessmentTitle,
              timing,
              status: row.assessmentStatus,
              completedAt: row.assessmentCompletedAt?.toISOString() ?? null,
              cancelledAt: row.assessmentCancelledAt?.toISOString() ?? null,
            },
            task,
          };
        };

        const loadInterview = async (
          userId: string,
          interviewId: string,
        ): Promise<InterviewView | null> => {
          const [row] = await databaseTransaction
            .select({
              id: interviews.id,
              jobTrackId: interviews.jobTrackId,
              sequenceNo: interviews.sequenceNo,
              roundLabel: interviews.roundLabel,
              interviewType: interviews.interviewType,
              startAt: interviews.startAt,
              endAt: interviews.endAt,
              meetingUrl: interviews.meetingUrl,
              notes: interviews.notes,
              status: interviews.status,
              cancelledAt: interviews.cancelledAt,
              occurredAt: interviews.occurredAt,
              reviewedAt: interviews.reviewedAt,
              transcriptText: interviews.transcriptText,
            })
            .from(interviews)
            .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
            .where(and(eq(interviews.id, interviewId), eq(jobTracks.userId, userId)))
            .limit(1);
          return row
            ? {
                ...row,
                startAt: row.startAt.toISOString(),
                endAt: row.endAt.toISOString(),
                cancelledAt: row.cancelledAt?.toISOString() ?? null,
                occurredAt: row.occurredAt?.toISOString() ?? null,
                reviewedAt: row.reviewedAt?.toISOString() ?? null,
                transcriptText: row.transcriptText,
              }
            : null;
        };

        const loadTask = async (userId: string, taskId: string): Promise<TaskView | null> => {
          const [row] = await databaseTransaction.select({
            id: tasks.id,
            jobTrackId: tasks.jobTrackId,
            interviewId: tasks.interviewId,
            assessmentId: tasks.assessmentId,
            kind: tasks.kind,
            title: tasks.title,
            deadlineAt: tasks.deadlineAt,
            completedAt: tasks.completedAt,
            cancelledAt: tasks.cancelledAt,
          }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
          return row ? {
            ...row,
            deadlineAt: row.deadlineAt?.toISOString() ?? null,
            completedAt: row.completedAt?.toISOString() ?? null,
            cancelledAt: row.cancelledAt?.toISOString() ?? null,
          } : null;
        };

        const transaction: JobWorkflowTransaction = {
          async findReceipt(userId, idempotencyKey) {
            const [receipt] = await databaseTransaction
              .select({ result: actionReceipts.result })
              .from(actionReceipts)
              .where(
                and(
                  eq(actionReceipts.userId, userId),
                  eq(actionReceipts.idempotencyKey, idempotencyKey),
                ),
              )
              .limit(1);
            return (receipt?.result as JobCommandResult | undefined) ?? null;
          },
          async saveReceipt(input) {
            await databaseTransaction.insert(actionReceipts).values({
              userId: input.userId,
              idempotencyKey: input.idempotencyKey,
              commandType: input.commandType,
              result: input.result as unknown as Record<string, unknown>,
            });
          },
          async insertJobTrack(jobTrack) {
            if (jobTrack.jobDescription.imageAssetIds.length > 0) {
              throw new Error("VALIDATION_ERROR: JD image persistence is not implemented yet");
            }
            await databaseTransaction.insert(jobTracks).values({
              id: jobTrack.id,
              userId: jobTrack.userId,
              companyName: jobTrack.companyName,
              roleName: jobTrack.roleName,
              lifecycle: jobTrack.lifecycle,
              jobUrl: jobTrack.jobUrl,
              createdAt: new Date(jobTrack.createdAt),
              updatedAt: new Date(jobTrack.createdAt),
              createdVia: jobTrack.createdVia,
            });
            await databaseTransaction.insert(jobDescriptions).values({
              jobTrackId: jobTrack.id,
              textContent: jobTrack.jobDescription.text,
              createdAt: new Date(jobTrack.createdAt),
              updatedAt: new Date(jobTrack.createdAt),
            });
            const inserted = await loadJobTrack(jobTrack.userId, jobTrack.id);
            if (!inserted) {
              throw new Error("INTERNAL_ERROR: inserted job track could not be read");
            }
            return inserted;
          },
          async updateJobTrackContext(input) {
            if (input.jobDescription.imageAssetIds.length > 0) throw new Error("VALIDATION_ERROR: JD image persistence is not implemented yet");
            const changed = await databaseTransaction.update(jobTracks).set({
              companyName: input.companyName,
              roleName: input.roleName,
              jobUrl: input.jobUrl,
              updatedAt: new Date(),
              version: sql`${jobTracks.version} + 1`,
            }).where(and(
              eq(jobTracks.id, input.jobTrackId),
              eq(jobTracks.userId, input.userId),
              eq(jobTracks.version, input.version),
            )).returning({ id: jobTracks.id });
            if (!changed.length) return null;
            await databaseTransaction.update(jobDescriptions).set({
              textContent: input.jobDescription.text,
              updatedAt: new Date(),
            }).where(eq(jobDescriptions.jobTrackId, input.jobTrackId));
            return loadJobTrack(input.userId, input.jobTrackId);
          },
          findJobTrack: loadJobTrack,
          async findResume(userId, resumeId) {
            const [resume] = await databaseTransaction
              .select({ id: resumes.id, userId: resumes.userId })
              .from(resumes)
              .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
              .limit(1);
            return resume ?? null;
          },
          async insertAssessmentWithTask(input) {
            const timing = input.assessment.timing;
            await databaseTransaction.insert(assessments).values({
              id: input.assessment.id,
              jobTrackId: input.assessment.jobTrackId,
              kind: input.assessment.kind,
              title: input.assessment.title,
              timingType: timing.type,
              deadlineAt: timing.type === "deadline" ? new Date(timing.deadlineAt) : null,
              startAt: timing.type === "fixed_slot" ? new Date(timing.startAt) : null,
              endAt: timing.type === "fixed_slot" ? new Date(timing.endAt) : null,
              status: input.assessment.status,
            });
            if (input.task) {
              await databaseTransaction.insert(tasks).values({
                id: input.task.id,
                userId: input.userId,
                jobTrackId: input.task.jobTrackId,
                assessmentId: input.task.assessmentId,
                kind: input.task.kind,
                title: input.task.title,
                deadlineAt: input.task.deadlineAt ? new Date(input.task.deadlineAt) : null,
              });
            }
            return input;
          },
          findAssessmentWithTask: loadAssessmentWithTask,
          async completeAssessmentWithTask(input) {
            const completedAt = new Date(input.completedAt);
            await databaseTransaction
              .update(assessments)
              .set({
                status: "completed",
                completedAt,
                updatedAt: completedAt,
              })
              .where(eq(assessments.id, input.assessmentId));
            await databaseTransaction
              .update(tasks)
              .set({ completedAt, updatedAt: completedAt })
              .where(
                and(
                  eq(tasks.assessmentId, input.assessmentId),
                  eq(tasks.userId, input.userId),
                ),
              );
            const completed = await loadAssessmentWithTask(input.userId, input.assessmentId);
            if (!completed) {
              throw new Error("NOT_FOUND: assessment was not found");
            }
            return completed;
          },
          async cancelAssessmentWithTask(input) {
            const cancelledAt = new Date(input.cancelledAt);
            await databaseTransaction.update(assessments).set({ status: "cancelled", cancelledAt, updatedAt: cancelledAt })
              .where(eq(assessments.id, input.assessmentId));
            await databaseTransaction.update(tasks).set({ cancelledAt, updatedAt: cancelledAt })
              .where(and(eq(tasks.assessmentId, input.assessmentId), eq(tasks.userId, input.userId)));
            const cancelled = await loadAssessmentWithTask(input.userId, input.assessmentId);
            if (!cancelled) throw new Error("NOT_FOUND: assessment was not found");
            return cancelled;
          },
          async insertInterview(interview) {
            await databaseTransaction.insert(interviews).values({
              id: interview.id,
              jobTrackId: interview.jobTrackId,
              sequenceNo: interview.sequenceNo,
              roundLabel: interview.roundLabel,
              interviewType: interview.interviewType,
              startAt: new Date(interview.startAt),
              endAt: new Date(interview.endAt),
              meetingUrl: interview.meetingUrl,
              notes: interview.notes,
              status: interview.status,
              cancelledAt: interview.cancelledAt ? new Date(interview.cancelledAt) : null,
              occurredAt: interview.occurredAt ? new Date(interview.occurredAt) : null,
              reviewedAt: interview.reviewedAt ? new Date(interview.reviewedAt) : null,
              transcriptText: interview.transcriptText,
            });
            return interview;
          },
          findInterview: loadInterview,
          async updateInterviewSchedule(input) {
            await databaseTransaction
              .update(interviews)
              .set({
                startAt: new Date(input.startAt),
                endAt: new Date(input.endAt),
                updatedAt: new Date(),
                version: sql`${interviews.version} + 1`,
              })
              .where(eq(interviews.id, input.interviewId));
            const updated = await loadInterview(input.userId, input.interviewId);
            if (!updated) {
              throw new Error("NOT_FOUND: interview was not found");
            }
            return updated;
          },
          async cancelInterviewWithPreparationTasks(input) {
            const cancelledAt = new Date(input.cancelledAt);
            await databaseTransaction
              .update(interviews)
              .set({
                status: "cancelled",
                cancelledAt,
                updatedAt: cancelledAt,
                version: sql`${interviews.version} + 1`,
              })
              .where(eq(interviews.id, input.interviewId));
            await databaseTransaction
              .update(tasks)
              .set({ cancelledAt, updatedAt: cancelledAt })
              .where(
                and(
                  eq(tasks.interviewId, input.interviewId),
                  eq(tasks.userId, input.userId),
                  eq(tasks.kind, "interview_prep"),
                ),
              );
            const cancelled = await loadInterview(input.userId, input.interviewId);
            if (!cancelled) {
              throw new Error("NOT_FOUND: interview was not found");
            }
            return cancelled;
          },
          async markInterviewOccurred(input) {
            const occurredAt = new Date(input.occurredAt);
            await databaseTransaction.update(interviews).set({
              occurredAt,
              updatedAt: occurredAt,
              version: sql`${interviews.version} + 1`,
            }).where(eq(interviews.id, input.interviewId));
            const occurred = await loadInterview(input.userId, input.interviewId);
            if (!occurred) throw new Error("NOT_FOUND: interview was not found");
            return occurred;
          },
          async completeInterviewReview(input) {
            const reviewedAt = new Date(input.reviewedAt);
            await databaseTransaction.update(interviews).set({
              occurredAt: new Date(input.occurredAt),
              reviewedAt,
              updatedAt: reviewedAt,
              version: sql`${interviews.version} + 1`,
            }).where(eq(interviews.id, input.interviewId));
            const reviewed = await loadInterview(input.userId, input.interviewId);
            if (!reviewed) throw new Error("NOT_FOUND: interview was not found");
            return reviewed;
          },
          async saveInterviewTranscript(input) {
            const savedAt = new Date(input.savedAt);
            await databaseTransaction.update(interviews).set({
              transcriptText: input.transcriptText,
              occurredAt: new Date(input.occurredAt),
              updatedAt: savedAt,
              version: sql`${interviews.version} + 1`,
            }).where(eq(interviews.id, input.interviewId));
            const saved = await loadInterview(input.userId, input.interviewId);
            if (!saved) throw new Error("NOT_FOUND: interview was not found");
            return saved;
          },
          async insertTask(input) {
            await databaseTransaction.insert(tasks).values({
              id: input.task.id,
              userId: input.userId,
              jobTrackId: input.task.jobTrackId,
              interviewId: input.task.interviewId,
              assessmentId: input.task.assessmentId,
              kind: input.task.kind,
              title: input.task.title,
              deadlineAt: input.task.deadlineAt ? new Date(input.task.deadlineAt) : null,
              completedAt: input.task.completedAt ? new Date(input.task.completedAt) : null,
              cancelledAt: input.task.cancelledAt ? new Date(input.task.cancelledAt) : null,
            });
            return input.task;
          },
          findTask: loadTask,
          async updateTask(input) {
            await databaseTransaction.update(tasks).set({
              title: input.title,
              deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
              interviewId: input.interviewId,
              updatedAt: new Date(),
            }).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId)));
            const updated = await loadTask(input.userId, input.taskId);
            if (!updated) throw new Error("NOT_FOUND: task was not found");
            return updated;
          },
          async completeTask(input) {
            const completedAt = new Date(input.completedAt);
            await databaseTransaction.update(tasks).set({ completedAt, updatedAt: completedAt })
              .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId)));
            const completed = await loadTask(input.userId, input.taskId);
            if (!completed) throw new Error("NOT_FOUND: task was not found");
            return completed;
          },
          async cancelTask(input) {
            const cancelledAt = new Date(input.cancelledAt);
            await databaseTransaction.update(tasks).set({ cancelledAt, updatedAt: cancelledAt })
              .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId)));
            const cancelled = await loadTask(input.userId, input.taskId);
            if (!cancelled) throw new Error("NOT_FOUND: task was not found");
            return cancelled;
          },
          async endJobTrack(input) {
            const endedAt = new Date(input.endedAt);
            await databaseTransaction.update(jobTracks).set({
              lifecycle: "ended", endedAt, endReason: input.endReason,
              updatedAt: endedAt, version: sql`${jobTracks.version} + 1`,
            }).where(and(eq(jobTracks.id, input.jobTrackId), eq(jobTracks.userId, input.userId)));
            await Promise.all([
              databaseTransaction.update(assessments).set({ status: "cancelled", cancelledAt: endedAt, updatedAt: endedAt })
                .where(and(eq(assessments.jobTrackId, input.jobTrackId), eq(assessments.status, "pending"))),
              databaseTransaction.update(interviews).set({ status: "cancelled", cancelledAt: endedAt, updatedAt: endedAt })
                .where(and(eq(interviews.jobTrackId, input.jobTrackId), eq(interviews.status, "scheduled"))),
              databaseTransaction.update(tasks).set({ cancelledAt: endedAt, updatedAt: endedAt })
                .where(and(eq(tasks.jobTrackId, input.jobTrackId), isNull(tasks.completedAt), isNull(tasks.cancelledAt))),
            ]);
            const ended = await loadJobTrack(input.userId, input.jobTrackId);
            if (!ended) throw new Error("NOT_FOUND: job track was not found");
            return ended;
          },
          async deleteJobTrack(userId, jobTrackId) {
            const deleted = await databaseTransaction.delete(jobTracks)
              .where(and(eq(jobTracks.id, jobTrackId), eq(jobTracks.userId, userId)))
              .returning({ id: jobTracks.id });
            if (!deleted.length) throw new Error("NOT_FOUND: job track was not found");
          },
          async markApplicationSubmitted(input) {
            await databaseTransaction
              .update(jobTracks)
              .set({
                lifecycle: "active",
                resumeId: input.resumeId,
                submittedAt: new Date(input.submittedAt),
                updatedAt: new Date(),
                version: sql`${jobTracks.version} + 1`,
              })
              .where(and(eq(jobTracks.id, input.jobTrackId), eq(jobTracks.userId, input.userId)));
            const updated = await loadJobTrack(input.userId, input.jobTrackId);
            if (!updated) {
              throw new Error("NOT_FOUND: job track was not found");
            }
            return updated;
          },
          async insertEvent(input) {
            await databaseTransaction.insert(events).values({
              id: input.id,
              userId: input.userId,
              jobTrackId: input.jobTrackId,
              kind: input.kind,
              subjectType: input.subjectType,
              subjectId: input.subjectId,
              occurredAt: new Date(input.occurredAt),
              actionId: input.actionId,
              payload: input.payload,
            });
            const event: JobEventView = {
              id: input.id,
              kind: input.kind,
              jobTrackId: input.jobTrackId,
              subjectType: input.subjectType,
              subjectId: input.subjectId,
              occurredAt: input.occurredAt,
              payload: input.payload,
            };
            return event;
          },
        };

        return work(transaction);
      });
    },
  };
}

function requireDate(value: Date | null, field: string): Date {
  if (!value) {
    throw new Error(`INTERNAL_ERROR: ${field} is required by timing type`);
  }
  return value;
}
