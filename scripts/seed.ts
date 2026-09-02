import { config } from "dotenv";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema";

config({ path: [".env.local", ".env"] });

const databaseUrl = process.env.DATABASE_URL;
const userId = process.env.APP_USER_ID;

if (!databaseUrl || !userId) {
  throw new Error("DATABASE_URL and APP_USER_ID are required");
}

const { db, close } = createDatabase(databaseUrl);

try {
  await db
    .insert(users)
    .values({
      id: userId,
      name: "本地用户",
      email: "local@job-hunting.app",
      timezone: "Asia/Shanghai",
    })
    .onConflictDoNothing({ target: users.id });
  console.log(`Seeded local user ${userId}`);
} finally {
  await close();
}
