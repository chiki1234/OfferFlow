import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { getPrivateObjectStorage } from "@/adapters/storage/private-object-storage";
import { assets } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { validateTranscriptUpload } from "./validation";

export type StagedTranscriptAsset = { id: string; storageKey: string; originalName: string; mimeType: string };

export async function stageTranscriptAsset(input: { userId: string; interviewId: string; file: File }): Promise<StagedTranscriptAsset> {
  const { extension } = validateTranscriptUpload(input.file);
  const storage = getPrivateObjectStorage();
  const id = randomUUID();
  const storageKey = `${input.userId}/transcripts/${input.interviewId}/${id}.${extension}`;
  const bytes = Buffer.from(await input.file.arrayBuffer());
  await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: storageKey, Body: bytes, ContentType: input.file.type }));
  try {
    await getDatabaseRuntime().db.insert(assets).values({
      id,
      userId: input.userId,
      kind: "transcript",
      storageKey,
      originalName: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  } catch (error) {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey })).catch(() => undefined);
    throw error;
  }
  return { id, storageKey, originalName: input.file.name, mimeType: input.file.type };
}

export async function discardTranscriptAsset(userId: string, asset: StagedTranscriptAsset | null) {
  if (!asset) return;
  await getDatabaseRuntime().db.delete(assets).where(and(eq(assets.id, asset.id), eq(assets.userId, userId)));
  const storage = getPrivateObjectStorage();
  await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: asset.storageKey })).catch(() => undefined);
}
