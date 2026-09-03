CREATE TABLE "faq_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"source_interview_id" uuid,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"items" jsonb NOT NULL,
	"matches" jsonb,
	"error_message" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faq_import_batches_status_check" CHECK ("faq_import_batches"."status" IN ('pending', 'analyzing', 'review', 'failed', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "faq_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"faq_id" uuid NOT NULL,
	"source_interview_id" uuid
);
--> statement-breakpoint
ALTER TABLE "faqs" DROP CONSTRAINT "faqs_source_interview_id_interviews_id_fk";
--> statement-breakpoint
DROP INDEX "faqs_source_interview_idx";--> statement-breakpoint
ALTER TABLE "faq_import_batches" ADD CONSTRAINT "faq_import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_import_batches" ADD CONSTRAINT "faq_import_batches_source_interview_id_interviews_id_fk" FOREIGN KEY ("source_interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_occurrences" ADD CONSTRAINT "faq_occurrences_faq_id_faqs_id_fk" FOREIGN KEY ("faq_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_occurrences" ADD CONSTRAINT "faq_occurrences_source_interview_id_interviews_id_fk" FOREIGN KEY ("source_interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "faq_import_batches_user_key_unique" ON "faq_import_batches" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "faq_import_batches_user_status_idx" ON "faq_import_batches" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "faq_occurrences_faq_idx" ON "faq_occurrences" USING btree ("faq_id");--> statement-breakpoint
CREATE INDEX "faq_occurrences_interview_idx" ON "faq_occurrences" USING btree ("source_interview_id");--> statement-breakpoint
INSERT INTO "faq_occurrences" ("faq_id", "source_interview_id")
SELECT "id", "source_interview_id" FROM "faqs";--> statement-breakpoint
ALTER TABLE "faqs" DROP COLUMN "source_interview_id";--> statement-breakpoint
ALTER TABLE "faqs" DROP COLUMN "canonical_question_id";
