import { createDatabase } from "./client";

type DatabaseRuntime = ReturnType<typeof createDatabase>;

const globalDatabase = globalThis as typeof globalThis & {
  jobHuntingDatabase?: DatabaseRuntime;
};

export function getDatabaseRuntime(): DatabaseRuntime {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!globalDatabase.jobHuntingDatabase) {
    globalDatabase.jobHuntingDatabase = createDatabase(databaseUrl);
  }

  return globalDatabase.jobHuntingDatabase;
}
