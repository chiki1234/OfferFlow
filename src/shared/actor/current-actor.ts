import type { ActorContext } from "@/modules/job-workflow/interface";
import { resolveActorFromEnvironment } from "@/shared/actor/actor-environment";

export function getCurrentActor(): ActorContext {
  return resolveActorFromEnvironment(process.env);
}
