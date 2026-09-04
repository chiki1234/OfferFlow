import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDatabaseRuntime } from "@/db/runtime";
import * as schema from "@/db/schema";
import {
  deliverAccountEmail,
  readAccountEmailConfiguration,
  type AccountEmailDelivery,
} from "@/adapters/email/account-email";
import {
  resolveAuthenticationMode,
  validateAuthenticationEnvironment,
} from "@/shared/actor/actor-environment";

const localModeSecret = "local-mode-only-better-auth-secret-placeholder";

type AccountEmailDeliveryFunction = (message: AccountEmailDelivery) => Promise<void>;

export function createOfferFlowAuth(
  sendAccountEmail: AccountEmailDeliveryFunction = deliverAccountEmail,
) {
  const authenticationMode = resolveAuthenticationMode(process.env);
  if (authenticationMode === "password") validateAuthenticationEnvironment(process.env);
  const deliverInBackground = (message: AccountEmailDelivery) => {
    void sendAccountEmail(message).catch(() => {
      console.error("OfferFlow account email delivery failed");
    });
  };

  return betterAuth({
    appName: "OfferFlow",
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
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (["/sign-up/email", "/send-verification-email", "/request-password-reset"].includes(context.path)) {
          try {
            readAccountEmailConfiguration(process.env);
          } catch {
            throw new APIError("SERVICE_UNAVAILABLE", {
              code: "EMAIL_SERVICE_UNAVAILABLE",
              message: "Account email service is not configured",
            });
          }
        }
        if (context.path === "/sign-up/email") {
          const name = typeof context.body?.name === "string" ? context.body.name.trim() : "";
          if (!name || name.length > 255) {
            throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: "Name must contain 1 to 255 characters" });
          }
          return { context: { body: { ...context.body, name } } };
        }
      }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        deliverInBackground({
          kind: "verification",
          to: user.email,
          name: user.name,
          url,
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        deliverInBackground({
          kind: "password-reset",
          to: user.email,
          name: user.name,
          url,
        });
      },
    },
    rateLimit: {
      enabled: process.env.NODE_ENV === "production",
      window: 60,
      max: 60,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
      },
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
}

let auth: ReturnType<typeof createOfferFlowAuth> | undefined;

export function getAuth() {
  auth ??= createOfferFlowAuth();
  return auth;
}
