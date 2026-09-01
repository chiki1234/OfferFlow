CREATE TYPE "public"."faq_kind" AS ENUM('experience', 'general');--> statement-breakpoint
CREATE TABLE "experience_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_interview_id" uuid NOT NULL,
	"kind" "faq_kind" NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"experience_id" uuid,
	"category" varchar(64) NOT NULL,
	"canonical_question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faqs_experience_kind_check" CHECK (("faqs"."kind" = 'experience' AND "faqs"."experience_id" IS NOT NULL) OR ("faqs"."kind" = 'general' AND "faqs"."experience_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "resume_experiences" (
	"resume_id" uuid NOT NULL,
	"experience_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "resume_experiences_resume_id_experience_id_pk" PRIMARY KEY("resume_id","experience_id")
);
--> statement-breakpoint
ALTER TABLE "experience_groups" ADD CONSTRAINT "experience_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_group_id_experience_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."experience_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_source_interview_id_interviews_id_fk" FOREIGN KEY ("source_interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_experiences" ADD CONSTRAINT "resume_experiences_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_experiences" ADD CONSTRAINT "resume_experiences_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experience_groups_user_sort_idx" ON "experience_groups" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "experiences_user_updated_idx" ON "experiences" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "faqs_user_kind_category_idx" ON "faqs" USING btree ("user_id","kind","category");--> statement-breakpoint
CREATE INDEX "faqs_experience_created_idx" ON "faqs" USING btree ("experience_id","created_at");--> statement-breakpoint
CREATE INDEX "faqs_source_interview_idx" ON "faqs" USING btree ("source_interview_id");