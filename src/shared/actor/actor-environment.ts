import type { ActorContext } from "@/modules/job-workflow/interface";

export type ActorEnvironment = {
  ALLOW_LOCAL_AUTH_IN_PRODUCTION?: string;
  APP_USER_ID?: string;
  AUTH_MODE?: string;
  NODE_ENV?: string;
  APP_URL?: string;
  AUTH_SECRET?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
};

export type AuthenticationMode = "local" | "password";

export function resolveAuthenticationMode(environment: ActorEnvironment): AuthenticationMode {
  const mode = environment.AUTH_MODE ?? (environment.NODE_ENV === "production" ? undefined : "local");

  if (!mode) {
    throw new Error("AUTH_MODE must be explicitly set in production");
  }
  if (mode !== "local" && mode !== "password") {
    throw new Error(`Unsupported AUTH_MODE "${mode}"`);
  }
  return mode;
}

export function resolveActorFromEnvironment(environment: ActorEnvironment): ActorContext {
  const mode = resolveAuthenticationMode(environment);
  if (mode !== "local") {
    throw new Error(`AUTH_MODE=${mode} requires an authenticated session`);
  }
  if (
    environment.NODE_ENV === "production" &&
    environment.ALLOW_LOCAL_AUTH_IN_PRODUCTION !== "true"
  ) {
    throw new Error(
      "AUTH_MODE=local is disabled in production; set ALLOW_LOCAL_AUTH_IN_PRODUCTION=true only for a trusted single-user deployment",
    );
  }

  const userId = environment.APP_USER_ID?.trim();
  if (!userId) {
    throw new Error("APP_USER_ID is required when AUTH_MODE=local");
  }

  return { userId };
}

export function validateAuthenticationEnvironment(environment: ActorEnvironment): void {
  const mode = resolveAuthenticationMode(environment);
  if (mode === "local") {
    resolveActorFromEnvironment(environment);
    return;
  }

  if ((environment.AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters when AUTH_MODE=password");
  }
  const appUrl = environment.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required when AUTH_MODE=password");
  const parsed = new URL(appUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use http or https");
  }
  if (environment.NODE_ENV === "production") {
    for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const) {
      if (!environment[name]?.trim()) throw new Error(`${name} is required when AUTH_MODE=password`);
    }
    const smtpPort = Number(environment.SMTP_PORT);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error("SMTP_PORT must be an integer between 1 and 65535");
    }
  }
}
