import { createPostgresJobWorkflowStore } from "@/adapters/database/postgres-job-workflow-store";
import { getDatabaseRuntime } from "@/db/runtime";
import { createJobWorkflow } from "./implementation";

export function getJobWorkflow() {
  const { db } = getDatabaseRuntime();
  return createJobWorkflow({
    store: createPostgresJobWorkflowStore(db),
  });
}
