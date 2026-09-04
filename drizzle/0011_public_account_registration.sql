-- Apply before enabling public registration. These credential accounts were
-- created by the administrator while public sign-up was disabled.
UPDATE "users"
SET "email_verified" = true, "updated_at" = now()
WHERE "email_verified" = false
  AND EXISTS (
    SELECT 1 FROM "accounts"
    WHERE "accounts"."user_id" = "users"."id"
      AND "accounts"."provider_id" = 'credential'
      AND "accounts"."issuer" = 'local:credential'
  );
