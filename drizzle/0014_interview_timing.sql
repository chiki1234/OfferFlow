CREATE TYPE "public"."interview_timing_type" AS ENUM('deadline', 'fixed_slot');--> statement-breakpoint
ALTER TABLE "interviews" ALTER COLUMN "start_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ALTER COLUMN "end_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "timing_type" "interview_timing_type" DEFAULT 'fixed_slot' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_time_consistency" CHECK (("interviews"."timing_type" = 'deadline' AND "interviews"."deadline_at" IS NOT NULL AND "interviews"."start_at" IS NULL AND "interviews"."end_at" IS NULL) OR ("interviews"."timing_type" = 'fixed_slot' AND "interviews"."deadline_at" IS NULL AND "interviews"."start_at" IS NOT NULL AND "interviews"."end_at" IS NOT NULL AND "interviews"."end_at" > "interviews"."start_at"));