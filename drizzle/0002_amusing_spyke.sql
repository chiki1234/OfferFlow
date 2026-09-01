CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_track_id" uuid NOT NULL,
	"sequence_no" integer,
	"round_label" varchar(255) NOT NULL,
	"interview_type" varchar(255) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"meeting_url" text,
	"notes" text,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"occurred_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"transcript_text" text,
	"transcript_asset_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "interview_id" uuid;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_track_id_job_tracks_id_fk" FOREIGN KEY ("job_track_id") REFERENCES "public"."job_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_transcript_asset_id_assets_id_fk" FOREIGN KEY ("transcript_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interviews_job_status_start_idx" ON "interviews" USING btree ("job_track_id","status","start_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;