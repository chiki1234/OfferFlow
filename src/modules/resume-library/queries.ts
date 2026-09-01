import { desc, eq } from "drizzle-orm";
import { resumes } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";

export function getResumeOptions(userId: string) {
  return getDatabaseRuntime().db.select({ id: resumes.id, name: resumes.name })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt));
}
