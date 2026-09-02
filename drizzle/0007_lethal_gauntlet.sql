ALTER TABLE "faqs" DROP CONSTRAINT "faqs_experience_kind_check";--> statement-breakpoint
ALTER TABLE "faqs" ALTER COLUMN "kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faqs" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_experience_kind_check" CHECK ("faqs"."kind" IS NULL OR "faqs"."kind" = 'experience' OR ("faqs"."kind" = 'general' AND "faqs"."experience_id" IS NULL));