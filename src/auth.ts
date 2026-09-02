import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDatabaseRuntime } from "@/db/runtime";
import * as schema from "@/db/schema";
import {
  resolveAuthenticationMode,
  validateAuthenticationEnvironment,
} from "@/shared/actor/actor-environment";

const localModeSecret = "local-mode-only-better-auth-secret-placeholder";
const authenticationMode = resolveAuthenticationMode(process.env);
if (authenticationMode === "password") validateAuthenticationEnvironment(process.env);

export const auth = betterAuth({
  appName: "求职轨迹",
  baseURL: process.env.APP_URL,
  secret: process.env.AUTH_SECRET ?? localModeSecret,
  database: drizzleAdapter(getDatabaseRuntime().db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      timezone: {
        type: "string",
        required: false,
        defaultValue: "Asia/Shanghai",
        input: false,
      },
    },
  },
});
