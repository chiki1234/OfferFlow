ALTER TABLE "job_tracks" ADD COLUMN "department" varchar(255);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_time_consistency" CHECK (("tasks"."start_at" IS NULL AND "tasks"."end_at" IS NULL) OR ("tasks"."deadline_at" IS NULL AND "tasks"."start_at" IS NOT NULL AND "tasks"."end_at" IS NOT NULL AND "tasks"."end_at" > "tasks"."start_at"));