import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDatabase } from "../src/db/client";
import { accounts, users } from "../src/db/schema";

config({ path: [".env.local", ".env"] });

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.INITIAL_USER_EMAIL?.trim().toLowerCase();
const name = process.env.INITIAL_USER_NAME?.trim() || "求职用户";
const password = process.env.INITIAL_USER_PASSWORD;

if (!databaseUrl || !email || !password) {
  throw new Error("DATABASE_URL、INITIAL_USER_EMAIL 和 INITIAL_USER_PASSWORD 均为必填项");
}
if (password.length < 10 || password.length > 128) {
  throw new Error("初始密码长度必须在 10 到 128 个字符之间");
}

const { db, close } = createDatabase(databaseUrl);

try {
  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  const user = existingUser ?? (await db.insert(users).values({ email, name }).returning())[0];
  if (!user) throw new Error("创建用户失败");

  const credential = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, user.id),
      eq(accounts.providerId, "credential"),
      eq(accounts.issuer, "local:credential"),
    ),
  });
  if (credential) throw new Error(`账号 ${email} 已经设置过密码，未做任何修改`);

  await db.insert(accounts).values({
    id: randomUUID(),
    userId: user.id,
    issuer: "local:credential",
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(password),
  });
  console.log(`已创建可登录账号 ${email}`);
} finally {
  await close();
}
