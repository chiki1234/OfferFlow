import { exportUserData } from "@/modules/data-export/service";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { privateResponseHeaders } from "@/shared/http/private-response-headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentActor();
  const document = await exportUserData(actor.userId);
  const date = document.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(document, null, 2), {
    headers: {
      ...privateResponseHeaders,
      "Content-Disposition": `attachment; filename="job-hunting-export-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
