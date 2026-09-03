import { after } from "next/server";
import { z } from "zod";
import { executeFaqImportAnalysis, getFaqImportBatch } from "@/modules/interview-knowledge/faq-import";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { privateResponseHeaders } from "@/shared/http/private-response-headers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const batch = await getFaqImportBatch((await getCurrentActor()).userId, z.uuid().parse((await params).id));
    const stale = batch.status === "analyzing" && batch.leaseExpiresAt && batch.leaseExpiresAt < new Date();
    return Response.json({ status: stale ? "pending" : batch.status, error: batch.errorMessage, completedCount: batch.matches?.length ?? 0, totalCount: batch.items.length }, { headers: privateResponseHeaders });
  } catch { return Response.json({ error: "批次不可用，请重新登录或刷新。" }, { status: 404, headers: privateResponseHeaders }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(process.env.APP_URL || request.url).origin) return new Response(null, { status: 403 });
  try {
    const actor = await getCurrentActor();
    const batchId = z.uuid().parse((await params).id);
    await getFaqImportBatch(actor.userId, batchId);
    if (process.env.AI_EXECUTOR !== "worker") after(() => executeFaqImportAnalysis(actor.userId, batchId));
    return Response.json({ accepted: true }, { status: 202, headers: privateResponseHeaders });
  } catch { return new Response(null, { status: 404 }); }
}
