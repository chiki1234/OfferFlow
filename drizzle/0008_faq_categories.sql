CREATE TABLE "faq_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "faq_kind" NOT NULL,
	"name" varchar(64) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faq_categories" ADD CONSTRAINT "faq_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "faq_categories_user_kind_name_unique" ON "faq_categories" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE INDEX "faq_categories_user_kind_sort_idx" ON "faq_categories" USING btree ("user_id","kind","sort_order");--> statement-breakpoint
INSERT INTO "faq_categories" ("id", "user_id", "kind", "name", "sort_order")
SELECT gen_random_uuid(), "users"."id", "defaults"."kind"::"faq_kind", "defaults"."name", "defaults"."sort_order"
FROM "users"
CROSS JOIN (VALUES
	('experience', '项目背景', 0),
	('experience', '方案设计', 1),
	('experience', '技术实现', 2),
	('experience', '决策思考', 3),
	('experience', '项目结果', 4),
	('experience', '复盘反思', 5),
	('experience', '其他', 6),
	('general', '求职动机', 0),
	('general', '综合能力', 1),
	('general', '协作沟通', 2),
	('general', '行为面试', 3),
	('general', '职业规划', 4),
	('general', '其他', 5)
) AS "defaults"("kind", "name", "sort_order")
ON CONFLICT ("user_id", "kind", "name") DO NOTHING;--> statement-breakpoint
INSERT INTO "faq_categories" ("id", "user_id", "kind", "name", "sort_order")
SELECT gen_random_uuid(), "faqs"."user_id", "faqs"."kind", "faqs"."category", 1000
FROM "faqs"
WHERE "faqs"."kind" IS NOT NULL AND "faqs"."category" IS NOT NULL
GROUP BY "faqs"."user_id", "faqs"."kind", "faqs"."category"
ON CONFLICT ("user_id", "kind", "name") DO NOTHING;
