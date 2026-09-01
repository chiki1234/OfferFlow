import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobTrackId: uuid("job_track_id").references(() => jobTracks.id, { onDelete: "cascade" }),
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
