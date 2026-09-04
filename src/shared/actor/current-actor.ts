import type { ActorContext } from "@/modules/job-workflow/interface";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/auth";
import {
  resolveActorFromEnvironment,
  resolveAuthenticationMode,
  validateAuthenticationEnvironment,
} from "@/shared/actor/actor-environment";

export async function getCurrentActor(): Promise<ActorContext> {
  const mode = resolveAuthenticationMode(process.env);
  if (mode === "local") return resolveActorFromEnvironment(process.env);

  validateAuthenticationEnvironment(process.env);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return { userId: session.user.id };
}
