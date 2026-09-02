ALTER TABLE "faqs" DROP CONSTRAINT "faqs_experience_kind_check";--> statement-breakpoint
UPDATE "faqs"
SET
	"category" = CASE
		WHEN "experience_id" IS NOT NULL OR "kind" IS NULL OR "kind" = 'experience' THEN NULL
		ELSE "category"
	END,
	"kind" = CASE
		WHEN "experience_id" IS NOT NULL THEN 'experience'::"faq_kind"
		ELSE 'general'::"faq_kind"
	END;--> statement-breakpoint
UPDATE "faq_categories"
SET "deleted_at" = COALESCE("deleted_at", now()), "updated_at" = now()
WHERE "kind" = 'experience';--> statement-breakpoint
ALTER TABLE "faqs" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_experience_kind_check" CHECK (("faqs"."kind" = 'experience' AND "faqs"."experience_id" IS NOT NULL AND "faqs"."category" IS NULL) OR ("faqs"."kind" = 'general' AND "faqs"."experience_id" IS NULL));
