import type { ActorContext } from "@/modules/job-workflow/interface";

export function getCurrentActor(): ActorContext {
  const userId = process.env.APP_USER_ID;
  if (!userId) {
    throw new Error("APP_USER_ID is required until interactive authentication is enabled");
  }
  return { userId };
}
