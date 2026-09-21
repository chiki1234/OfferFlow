ALTER TABLE "assessments" ADD COLUMN "assessment_url" text;--> statement-breakpoint
ALTER TABLE "job_tracks" ADD COLUMN "preference_rank" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "job_tracks_company_preference_unique" ON "job_tracks" USING btree ("user_id",lower(btrim("company_name")),"preference_rank");--> statement-breakpoint
ALTER TABLE "job_tracks" ADD CONSTRAINT "job_tracks_preference_positive" CHECK ("job_tracks"."preference_rank" > 0);