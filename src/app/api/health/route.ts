import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { getPrivateObjectStorage } from "@/adapters/storage/private-object-storage";
import { getDatabaseRuntime } from "@/db/runtime";
import { validateAuthenticationEnvironment } from "@/shared/actor/actor-environment";
import { runReadinessChecks } from "@/shared/health/readiness-checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await runReadinessChecks({
    authentication: async () => {
      validateAuthenticationEnvironment(process.env);
    },
    database: async () => {
      await getDatabaseRuntime().db.execute(sql`select 1`);
    },
    objectStorage: async () => {
      const storage = getPrivateObjectStorage();
      await storage.client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
    },
  });
  const ready = Object.values(checks).every(Boolean);

  return Response.json({ status: ready ? "ok" : "unavailable", checks }, { status: ready ? 200 : 503 });
}
