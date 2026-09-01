import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const jobLifecycle = pgEnum("job_lifecycle", ["planned", "active", "ended"]);
export const jobCreatedVia = pgEnum("job_created_via", ["normal", "quick_import"]);
export const assetKind = pgEnum("asset_kind", ["jd_image", "resume", "transcript"]);
export const assetOwnerType = pgEnum("asset_owner_type", ["job_description"]);
export const assessmentKind = pgEnum("assessment_kind", ["assessment", "written_test"]);
export const assessmentTimingType = pgEnum("assessment_timing_type", [
  "deadline",
  "fixed_slot",
]);
export const assessmentStatus = pgEnum("assessment_status", [
  "pending",
  "completed",
  "cancelled",
]);
export const interviewStatus = pgEnum("interview_status", ["scheduled", "cancelled"]);
export const faqKind = pgEnum("faq_kind", ["experience", "general"]);
export const taskKind = pgEnum("task_kind", ["generic", "interview_prep", "assessment"]);
export const eventSubjectType = pgEnum("event_subject_type", [
  "job_track",
  "assessment",
  "interview",
  "task",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assets_storage_key_unique").on(table.storageKey),
    index("assets_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const assetLinks = pgTable(
  "asset_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    ownerType: assetOwnerType("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("asset_links_owner_asset_unique").on(table.ownerType, table.ownerId, table.assetId),
    index("asset_links_owner_sort_idx").on(table.ownerType, table.ownerId, table.sortOrder),
  ],
);

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("resumes_asset_unique").on(table.assetId),
    index("resumes_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const experienceGroups = pgTable(
  "experience_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("experience_groups_user_sort_idx").on(table.userId, table.sortOrder)],
);

export const experiences = pgTable(
  "experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => experienceGroups.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    content: text("content").notNull(),
    ...timestamps,
  },
  (table) => [index("experiences_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const resumeExperiences = pgTable(
  "resume_experiences",
  {
    resumeId: uuid("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    experienceId: uuid("experience_id").notNull().references(() => experiences.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.resumeId, table.experienceId] })],
);

export const jobTracks = pgTable(
  "job_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    roleName: varchar("role_name", { length: 255 }).notNull(),
    jobUrl: text("job_url"),
    lifecycle: jobLifecycle("lifecycle").notNull().default("planned"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "restrict" }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: varchar("end_reason", { length: 64 }),
    createdVia: jobCreatedVia("created_via").notNull().default("normal"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("job_tracks_user_lifecycle_updated_idx").on(
      table.userId,
      table.lifecycle,
      table.updatedAt,
    ),
  ],
);

export const jobDescriptions = pgTable(
  "job_descriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobTrackId: uuid("job_track_id")
      .notNull()
      .references(() => jobTracks.id, { onDelete: "cascade" }),
    textContent: text("text_content"),
    ...timestamps,
  },
  (table) => [uniqueIndex("job_descriptions_job_track_unique").on(table.jobTrackId)],
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobTrackId: uuid("job_track_id")
      .notNull()
      .references(() => jobTracks.id, { onDelete: "cascade" }),
    kind: assessmentKind("kind").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    timingType: assessmentTimingType("timing_type").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    status: assessmentStatus("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("assessments_job_status_deadline_idx").on(
      table.jobTrackId,
      table.status,
      table.deadlineAt,
    ),
  ],
);

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobTrackId: uuid("job_track_id")
      .notNull()
      .references(() => jobTracks.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no"),
    roundLabel: varchar("round_label", { length: 255 }).notNull(),
    interviewType: varchar("interview_type", { length: 255 }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    status: interviewStatus("status").notNull().default("scheduled"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    transcriptText: text("transcript_text"),
    transcriptAssetId: uuid("transcript_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("interviews_job_status_start_idx").on(
      table.jobTrackId,
      table.status,
      table.startAt,
    ),
  ],
);

export const faqs = pgTable(
  "faqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceInterviewId: uuid("source_interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
    kind: faqKind("kind").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    experienceId: uuid("experience_id").references(() => experiences.id, { onDelete: "restrict" }),
    category: varchar("category", { length: 64 }).notNull(),
    canonicalQuestionId: uuid("canonical_question_id"),
    ...timestamps,
  },
  (table) => [
    check("faqs_experience_kind_check", sql`(${table.kind} = 'experience' AND ${table.experienceId} IS NOT NULL) OR (${table.kind} = 'general' AND ${table.experienceId} IS NULL)`),
    index("faqs_user_kind_category_idx").on(table.userId, table.kind, table.category),
    index("faqs_experience_created_idx").on(table.experienceId, table.createdAt),
    index("faqs_source_interview_idx").on(table.sourceInterviewId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobTrackId: uuid("job_track_id").references(() => jobTracks.id, { onDelete: "cascade" }),
    interviewId: uuid("interview_id").references(() => interviews.id, {
      onDelete: "cascade",
    }),
    assessmentId: uuid("assessment_id").references(() => assessments.id, {
      onDelete: "cascade",
    }),
    kind: taskKind("kind").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tasks_assessment_unique").on(table.assessmentId),
    index("tasks_user_completion_deadline_idx").on(
      table.userId,
      table.completedAt,
      table.deadlineAt,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobTrackId: uuid("job_track_id")
      .notNull()
      .references(() => jobTracks.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    subjectType: eventSubjectType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    actionId: varchar("action_id", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("events_action_subject_unique").on(
      table.userId,
      table.actionId,
      table.kind,
      table.subjectId,
    ),
    index("events_job_occurred_idx").on(table.jobTrackId, table.occurredAt, table.recordedAt),
  ],
);

export const actionReceipts = pgTable(
  "action_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    commandType: varchar("command_type", { length: 64 }).notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("action_receipts_user_key_unique").on(table.userId, table.idempotencyKey),
  ],
);
