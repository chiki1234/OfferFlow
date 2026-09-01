import { getDatabaseRuntime } from "@/db/runtime";
import { createPostgresWorkspaceQueries } from "./postgres";

export function getWorkspaceQueries() {
  return createPostgresWorkspaceQueries(getDatabaseRuntime().db);
}
