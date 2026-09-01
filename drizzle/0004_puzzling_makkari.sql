CREATE TYPE "public"."asset_owner_type" AS ENUM('job_description');--> statement-breakpoint
CREATE TABLE "asset_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"owner_type" "asset_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_links_owner_asset_unique" ON "asset_links" USING btree ("owner_type","owner_id","asset_id");--> statement-breakpoint
CREATE INDEX "asset_links_owner_sort_idx" ON "asset_links" USING btree ("owner_type","owner_id","sort_order");