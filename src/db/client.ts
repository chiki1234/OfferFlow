import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export type AppDatabase = ReturnType<typeof createDatabase>["db"];
