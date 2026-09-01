import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { getPrivateObjectStorage } from "@/adapters/storage/private-object-storage";
import { getDatabaseRuntime } from "@/db/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { database: false, objectStorage: false };
  try {
    await getDatabaseRuntime().db.execute(sql`select 1`);
    checks.database = true;
    const storage = getPrivateObjectStorage();
    await storage.client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
    checks.objectStorage = true;
  } catch {
    return Response.json({ status: "unavailable", checks }, { status: 503 });
  }
  return Response.json({ status: "ok", checks });
}
