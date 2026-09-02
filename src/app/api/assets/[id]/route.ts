import { GetObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { getPrivateObjectStorage } from "@/adapters/storage/private-object-storage";
import { getOwnedAsset } from "@/modules/job-description-assets/service";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { privateResponseHeaders } from "@/shared/http/private-response-headers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const assetId = z.uuid().parse((await params).id);
    const actor = await getCurrentActor();
    const asset = await getOwnedAsset(actor.userId, assetId);
    const storage = getPrivateObjectStorage();
    const object = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: asset.storageKey }));
    if (!object.Body) return new Response(null, { status: 404 });
    const bytes = await object.Body.transformToByteArray();
    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    return new Response(responseBytes.buffer, {
      headers: {
        ...privateResponseHeaders,
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
