import type { ActorContext } from "@/modules/job-workflow/interface";

export type ActorEnvironment = {
  ALLOW_LOCAL_AUTH_IN_PRODUCTION?: string;
  APP_USER_ID?: string;
  AUTH_MODE?: string;
  NODE_ENV?: string;
};

export function resolveActorFromEnvironment(environment: ActorEnvironment): ActorContext {
  const mode = environment.AUTH_MODE ?? (environment.NODE_ENV === "production" ? undefined : "local");

  if (!mode) {
    throw new Error("AUTH_MODE must be explicitly set in production");
  }
  if (mode !== "local") {
    throw new Error(`Unsupported AUTH_MODE "${mode}"; interactive authentication is not configured`);
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
