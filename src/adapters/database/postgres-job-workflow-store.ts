import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  actionReceipts,
  assetLinks,
  assets,
  assessments,
  events,
  faqImportBatches,
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
              department: jobTracks.department,
              preferenceRank: jobTracks.preferenceRank,
              lifecycle: jobTracks.lifecycle,
              jobUrl: jobTracks.jobUrl,
              resumeId: jobTracks.resumeId,
              submittedAt: jobTracks.submittedAt,
              createdAt: jobTracks.createdAt,
              createdVia: jobTracks.createdVia,
              version: jobTracks.version,
              descriptionId: jobDescriptions.id,
              descriptionText: jobDescriptions.textContent,
            })
            .from(jobTracks)
            .leftJoin(jobDescriptions, eq(jobDescriptions.jobTrackId, jobTracks.id))
            .where(and(eq(jobTracks.id, jobTrackId), eq(jobTracks.userId, userId)))
            .limit(1);

          if (!row) return null;
          const imageRows = row.descriptionId
            ? await databaseTransaction.select({ id: assetLinks.assetId }).from(assetLinks)
                .where(and(eq(assetLinks.ownerType, "job_description"), eq(assetLinks.ownerId, row.descriptionId)))
                .orderBy(assetLinks.sortOrder)
            : [];
          return {
                id: row.id,
                userId: row.userId,
                companyName: row.companyName,
                roleName: row.roleName,
                department: row.department,
                preferenceRank: row.preferenceRank,
                lifecycle: row.lifecycle,
                jobUrl: row.jobUrl,
                resumeId: row.resumeId,
                submittedAt: row.submittedAt?.toISOString() ?? null,
                createdAt: row.createdAt.toISOString(),
                createdVia: row.createdVia,
                version: row.version,
                jobDescription: {
                  text: row.descriptionText,
                  imageAssetIds: imageRows.map((item) => item.id),
                },
              };
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
              assessmentUrl: assessments.assessmentUrl,
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
              assessmentUrl: row.assessmentUrl,
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
              timingType: interviews.timingType,
              deadlineAt: interviews.deadlineAt,
              startAt: interviews.startAt,
              endAt: interviews.endAt,
              meetingUrl: interviews.meetingUrl,
              notes: interviews.notes,
              status: interviews.status,
              cancelledAt: interviews.cancelledAt,
              occurredAt: interviews.occurredAt,
              reviewedAt: interviews.reviewedAt,
              transcriptText: interviews.transcriptText,
              transcriptAssetId: interviews.transcriptAssetId,
            })
            .from(interviews)
            .innerJoin(jobTracks, eq(jobTracks.id, interviews.jobTrackId))
            .where(and(eq(interviews.id, interviewId), eq(jobTracks.userId, userId)))
            .limit(1);
          return row
            ? {
                id: row.id,
                jobTrackId: row.jobTrackId,
                sequenceNo: row.sequenceNo,
                roundLabel: row.roundLabel,
                interviewType: row.interviewType,
                timing: row.timingType === "deadline"
                  ? { type: "deadline", deadlineAt: requireDate(row.deadlineAt, "interview.deadlineAt").toISOString() }
                  : { type: "fixed_slot", startAt: requireDate(row.startAt, "interview.startAt").toISOString(), endAt: requireDate(row.endAt, "interview.endAt").toISOString() },
                meetingUrl: row.meetingUrl,
                notes: row.notes,
                status: row.status,
                cancelledAt: row.cancelledAt?.toISOString() ?? null,
                occurredAt: row.occurredAt?.toISOString() ?? null,
                reviewedAt: row.reviewedAt?.toISOString() ?? null,
                transcriptText: row.transcriptText,
                transcriptAssetId: row.transcriptAssetId,
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
            startAt: tasks.startAt, endAt: tasks.endAt,
            completedAt: tasks.completedAt,
            cancelledAt: tasks.cancelledAt,
          }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
          return row ? {
            ...row,
            deadlineAt: row.deadlineAt?.toISOString() ?? null,
            startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null,
            completedAt: row.completedAt?.toISOString() ?? null,
            cancelledAt: row.cancelledAt?.toISOString() ?? null,
          } : null;
        };

        const transaction: JobWorkflowTransaction = {
          async findReceipt(userId, idempotencyKey) {
            await databaseTransaction.execute(sql`select pg_advisory_xact_lock(hashtext(${userId + ":action:" + idempotencyKey}))`);
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
          async assertPreferenceAvailable(userId, companyName, rank, exceptId) {
            if (rank == null) return;
            await databaseTransaction.execute(sql`select pg_advisory_xact_lock(hashtext(${userId + ":" + companyName.trim().toLowerCase()}))`);
            const rows = await databaseTransaction.select({ id: jobTracks.id }).from(jobTracks).where(and(eq(jobTracks.userId, userId), sql`lower(btrim(${jobTracks.companyName})) = ${companyName.trim().toLowerCase()}`, eq(jobTracks.preferenceRank, rank)));
            if (rows.some(row => row.id !== exceptId)) throw new Error("CONFLICT: 同公司志愿不能重复");
          },
          async deleteTask(userId, taskId) {
            await databaseTransaction.delete(events).where(and(eq(events.userId, userId), eq(events.subjectId, taskId)));
            await databaseTransaction.delete(actionReceipts).where(and(eq(actionReceipts.userId, userId), sql`${actionReceipts.result}::text LIKE ${'%' + taskId + '%'}`));
            await databaseTransaction.delete(tasks).where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)));
          },
          async updateAssessmentWithTask(input) {
            const { assessment, task } = input;
            const timing = assessment.timing;
            await databaseTransaction.update(assessments).set({ title: assessment.title, kind: assessment.kind, assessmentUrl: assessment.assessmentUrl, timingType: timing.type, deadlineAt: timing.type === "deadline" ? new Date(timing.deadlineAt) : null, startAt: timing.type === "fixed_slot" ? new Date(timing.startAt) : null, endAt: timing.type === "fixed_slot" ? new Date(timing.endAt) : null, updatedAt: new Date() }).where(eq(assessments.id, assessment.id));
            if (task) {
              const values = { ...task, startAt: task.startAt ? new Date(task.startAt) : null, endAt: task.endAt ? new Date(task.endAt) : null, userId: input.userId, deadlineAt: task.deadlineAt ? new Date(task.deadlineAt) : null, completedAt: task.completedAt ? new Date(task.completedAt) : null, cancelledAt: task.cancelledAt ? new Date(task.cancelledAt) : null, updatedAt: new Date() };
              await databaseTransaction.insert(tasks).values(values).onConflictDoUpdate({ target: tasks.id, set: values });
            } else await databaseTransaction.delete(tasks).where(and(eq(tasks.assessmentId, assessment.id), eq(tasks.userId, input.userId)));
            return input;
          },
          async insertJobTrack(jobTrack) {
            if (jobTrack.jobDescription.imageAssetIds.length > 0) {
              const ownedAssets = await databaseTransaction.select({ id: assets.id }).from(assets).where(and(
                eq(assets.userId, jobTrack.userId),
                eq(assets.kind, "jd_image"),
                inArray(assets.id, jobTrack.jobDescription.imageAssetIds),
              ));
              if (ownedAssets.length !== new Set(jobTrack.jobDescription.imageAssetIds).size) {
                throw new Error("NOT_FOUND: one or more JD images were not found");
              }
            }
            await databaseTransaction.insert(jobTracks).values({
              id: jobTrack.id,
              userId: jobTrack.userId,
              companyName: jobTrack.companyName,
              roleName: jobTrack.roleName,
              department: jobTrack.department,
              preferenceRank: jobTrack.preferenceRank,
              lifecycle: jobTrack.lifecycle,
              jobUrl: jobTrack.jobUrl,
              createdAt: new Date(jobTrack.createdAt),
              updatedAt: new Date(jobTrack.createdAt),
              createdVia: jobTrack.createdVia,
            });
            const [description] = await databaseTransaction.insert(jobDescriptions).values({
              jobTrackId: jobTrack.id,
              textContent: jobTrack.jobDescription.text,
              createdAt: new Date(jobTrack.createdAt),
              updatedAt: new Date(jobTrack.createdAt),
            }).returning({ id: jobDescriptions.id });
            if (jobTrack.jobDescription.imageAssetIds.length) {
              await databaseTransaction.insert(assetLinks).values(jobTrack.jobDescription.imageAssetIds.map((assetId, sortOrder) => ({
                assetId,
                ownerType: "job_description" as const,
                ownerId: description.id,
                sortOrder,
              })));
            }
            const inserted = await loadJobTrack(jobTrack.userId, jobTrack.id);
            if (!inserted) {
              throw new Error("INTERNAL_ERROR: inserted job track could not be read");
            }
            return inserted;
          },
          async updateJobTrackContext(input) {
            if (input.jobDescription.imageAssetIds.length) {
              const ownedAssets = await databaseTransaction.select({ id: assets.id }).from(assets).where(and(
                eq(assets.userId, input.userId),
                eq(assets.kind, "jd_image"),
                inArray(assets.id, input.jobDescription.imageAssetIds),
              ));
              if (ownedAssets.length !== new Set(input.jobDescription.imageAssetIds).size) {
                throw new Error("NOT_FOUND: one or more JD images were not found");
              }
            }
            const changed = await databaseTransaction.update(jobTracks).set({
              companyName: input.companyName,
              roleName: input.roleName,
              department: input.department,
              lifecycle: input.lifecycle,
              submittedAt: input.submittedAt === undefined ? undefined : input.submittedAt ? new Date(input.submittedAt) : null,
              resumeId: input.resumeId,
              preferenceRank: input.preferenceRank,
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
            const [description] = await databaseTransaction.select({ id: jobDescriptions.id }).from(jobDescriptions)
              .where(eq(jobDescriptions.jobTrackId, input.jobTrackId)).limit(1);
            if (!description) throw new Error("NOT_FOUND: job description was not found");
            await databaseTransaction.delete(assetLinks).where(and(
              eq(assetLinks.ownerType, "job_description"),
              eq(assetLinks.ownerId, description.id),
            ));
            if (input.jobDescription.imageAssetIds.length) {
              await databaseTransaction.insert(assetLinks).values(input.jobDescription.imageAssetIds.map((assetId, sortOrder) => ({
                assetId,
                ownerType: "job_description" as const,
                ownerId: description.id,
                sortOrder,
              })));
            }
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
          async findAsset(userId, assetId) {
            const [asset] = await databaseTransaction.select({ id: assets.id, userId: assets.userId, kind: assets.kind })
              .from(assets).where(and(eq(assets.id, assetId), eq(assets.userId, userId))).limit(1);
            return asset ?? null;
          },
          async insertAssessmentWithTask(input) {
            const timing = input.assessment.timing;
            await databaseTransaction.insert(assessments).values({
              id: input.assessment.id,
              jobTrackId: input.assessment.jobTrackId,
              kind: input.assessment.kind,
              title: input.assessment.title,
              assessmentUrl: input.assessment.assessmentUrl,
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
              startAt: input.task.startAt ? new Date(input.task.startAt) : null, endAt: input.task.endAt ? new Date(input.task.endAt) : null,
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
          async deleteAssessmentWithRelatedData(input) {
            const relatedTasks = await databaseTransaction.select({ id: tasks.id }).from(tasks).where(and(
              eq(tasks.userId, input.userId),
              eq(tasks.assessmentId, input.assessmentId),
            ));
            await databaseTransaction.delete(events).where(and(
              eq(events.userId, input.userId),
              inArray(events.subjectId, [input.assessmentId, ...relatedTasks.map((task) => task.id)]),
            ));
            await databaseTransaction.delete(actionReceipts).where(and(
              eq(actionReceipts.userId, input.userId),
              sql`${actionReceipts.result}::text LIKE ${`%${input.assessmentId}%`}`,
            ));
            const deleted = await databaseTransaction.delete(assessments)
              .where(eq(assessments.id, input.assessmentId))
              .returning({ id: assessments.id });
            if (!deleted.length) throw new Error("NOT_FOUND: assessment was not found");
          },
          async insertInterview(interview) {
            await databaseTransaction.insert(interviews).values({
              id: interview.id,
              jobTrackId: interview.jobTrackId,
              sequenceNo: interview.sequenceNo,
              roundLabel: interview.roundLabel,
              interviewType: interview.interviewType,
              timingType: interview.timing.type,
              deadlineAt: interview.timing.type === "deadline" ? new Date(interview.timing.deadlineAt) : null,
              startAt: interview.timing.type === "fixed_slot" ? new Date(interview.timing.startAt) : null,
              endAt: interview.timing.type === "fixed_slot" ? new Date(interview.timing.endAt) : null,
              meetingUrl: interview.meetingUrl,
              notes: interview.notes,
              status: interview.status,
              cancelledAt: interview.cancelledAt ? new Date(interview.cancelledAt) : null,
              occurredAt: interview.occurredAt ? new Date(interview.occurredAt) : null,
              reviewedAt: interview.reviewedAt ? new Date(interview.reviewedAt) : null,
              transcriptText: interview.transcriptText,
              transcriptAssetId: interview.transcriptAssetId,
            });
            return interview;
          },
          findInterview: loadInterview,
          async updateInterviewSchedule(input) {
            await databaseTransaction
              .update(interviews)
              .set({
                timingType: input.timing.type,
                deadlineAt: input.timing.type === "deadline" ? new Date(input.timing.deadlineAt) : null,
                startAt: input.timing.type === "fixed_slot" ? new Date(input.timing.startAt) : null,
                endAt: input.timing.type === "fixed_slot" ? new Date(input.timing.endAt) : null,
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
          async deleteInterviewWithRelatedData(input) {
            const relatedTasks = await databaseTransaction.select({ id: tasks.id }).from(tasks).where(and(
              eq(tasks.userId, input.userId),
              eq(tasks.interviewId, input.interviewId),
            ));
            await databaseTransaction.delete(events).where(and(
              eq(events.userId, input.userId),
              inArray(events.subjectId, [input.interviewId, ...relatedTasks.map((task) => task.id)]),
            ));
            await databaseTransaction.delete(actionReceipts).where(and(
              eq(actionReceipts.userId, input.userId),
              sql`${actionReceipts.result}::text LIKE ${`%${input.interviewId}%`}`,
            ));
            const deleted = await databaseTransaction.delete(interviews)
              .where(eq(interviews.id, input.interviewId))
              .returning({ id: interviews.id });
            if (!deleted.length) throw new Error("NOT_FOUND: interview was not found");
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
              transcriptAssetId: input.transcriptAssetId,
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
              startAt: input.task.startAt ? new Date(input.task.startAt) : null, endAt: input.task.endAt ? new Date(input.task.endAt) : null,
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
              startAt: input.startAt ? new Date(input.startAt) : null, endAt: input.endAt ? new Date(input.endAt) : null,
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
            const owned = await loadJobTrack(userId, jobTrackId);
            if (!owned) throw new Error("NOT_FOUND: job track was not found");
            const relatedInterviews = await databaseTransaction.select({ id: interviews.id }).from(interviews).where(eq(interviews.jobTrackId, jobTrackId));
            for (const interview of relatedInterviews) {
              await databaseTransaction.update(faqImportBatches).set({
                items: sql`(SELECT COALESCE(jsonb_agg(CASE WHEN item->>'sourceInterviewId' = ${interview.id} THEN jsonb_set(item, '{sourceInterviewId}', 'null'::jsonb) ELSE item END), '[]'::jsonb) FROM jsonb_array_elements(${faqImportBatches.items}) AS item)`,
              }).where(eq(faqImportBatches.userId, userId));
            }
            const descriptions = await databaseTransaction.select({ id: jobDescriptions.id }).from(jobDescriptions).where(eq(jobDescriptions.jobTrackId, jobTrackId));
            if (descriptions.length) await databaseTransaction.delete(assetLinks).where(and(eq(assetLinks.ownerType, "job_description"), inArray(assetLinks.ownerId, descriptions.map(item => item.id))));
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
