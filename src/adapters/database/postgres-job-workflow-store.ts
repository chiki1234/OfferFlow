import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  actionReceipts,
  assessments,
  events,
  jobDescriptions,
  jobTracks,
  resumes,
  tasks,
} from "@/db/schema";
import type { JobCommandResult, JobEventView } from "@/modules/job-workflow/interface";
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
                jobDescription: {
                  text: row.descriptionText,
                  imageAssetIds: [],
                },
              }
            : null;
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
              payload: {},
            });
            const event: JobEventView = {
              id: input.id,
              kind: input.kind,
              jobTrackId: input.jobTrackId,
              subjectType: input.subjectType,
              subjectId: input.subjectId,
              occurredAt: input.occurredAt,
            };
            return event;
          },
        };

        return work(transaction);
      });
    },
  };
}
