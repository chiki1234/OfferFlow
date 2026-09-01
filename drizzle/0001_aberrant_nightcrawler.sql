CREATE TYPE "public"."assessment_kind" AS ENUM('assessment', 'written_test');--> statement-breakpoint
CREATE TYPE "public"."assessment_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."assessment_timing_type" AS ENUM('deadline', 'fixed_slot');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('generic', 'interview_prep', 'assessment');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_track_id" uuid NOT NULL,
	"kind" "assessment_kind" NOT NULL,
	"title" varchar(255) NOT NULL,
	"timing_type" "assessment_timing_type" NOT NULL,
	"deadline_at" timestamp with time zone,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" "assessment_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_track_id" uuid,
	"assessment_id" uuid,
	"kind" "task_kind" NOT NULL,
	"title" varchar(255) NOT NULL,
	"deadline_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_job_track_id_job_tracks_id_fk" FOREIGN KEY ("job_track_id") REFERENCES "public"."job_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_track_id_job_tracks_id_fk" FOREIGN KEY ("job_track_id") REFERENCES "public"."job_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_job_status_deadline_idx" ON "assessments" USING btree ("job_track_id","status","deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_assessment_unique" ON "tasks" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "tasks_user_completion_deadline_idx" ON "tasks" USING btree ("user_id","completed_at","deadline_at");