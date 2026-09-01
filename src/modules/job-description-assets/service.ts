import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getPrivateObjectStorage } from "@/adapters/storage/private-object-storage";
import { assetLinks, assets, jobDescriptions, jobTracks } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { validateJobDescriptionImages } from "./validation";

export type StagedJobDescriptionImage = { id: string; storageKey: string; originalName: string; mimeType: string };

export async function stageJobDescriptionImages(input: { userId: string; files: File[] }): Promise<StagedJobDescriptionImage[]> {
  const validated = validateJobDescriptionImages(input.files);
  const storage = getPrivateObjectStorage();
  const staged: Array<StagedJobDescriptionImage & { size: number; sha256: string }> = [];
  try {
    for (const [index, file] of input.files.entries()) {
      const id = randomUUID();
      const storageKey = `${input.userId}/job-descriptions/staged/${id}.${validated[index].extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: storageKey, Body: bytes, ContentType: file.type }));
      staged.push({ id, storageKey, originalName: file.name, mimeType: file.type, size: file.size, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await getDatabaseRuntime().db.insert(assets).values(staged.map((item) => ({
      id: item.id,
      userId: input.userId,
      kind: "jd_image" as const,
      storageKey: item.storageKey,
      originalName: item.originalName,
      mimeType: item.mimeType,
      sizeBytes: item.size,
      sha256: item.sha256,
    })));
    return staged.map(({ id, storageKey, originalName, mimeType }) => ({ id, storageKey, originalName, mimeType }));
  } catch (error) {
    await Promise.all(staged.map((item) => storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: item.storageKey })).catch(() => undefined)));
    throw error;
  }
}

export async function discardStagedJobDescriptionImages(userId: string, staged: StagedJobDescriptionImage[]) {
  if (!staged.length) return;
  await getDatabaseRuntime().db.delete(assets).where(and(eq(assets.userId, userId), inArray(assets.id, staged.map((item) => item.id))));
  const storage = getPrivateObjectStorage();
  await Promise.all(staged.map((item) => storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: item.storageKey })).catch(() => undefined)));
}

export async function listJobDescriptionAssetsForCleanup(input: { userId: string; jobTrackId: string }): Promise<StagedJobDescriptionImage[]> {
  return getDatabaseRuntime().db.select({
    id: assets.id,
    storageKey: assets.storageKey,
    originalName: assets.originalName,
    mimeType: assets.mimeType,
  }).from(assetLinks)
    .innerJoin(assets, eq(assets.id, assetLinks.assetId))
    .innerJoin(jobDescriptions, eq(jobDescriptions.id, assetLinks.ownerId))
    .innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId))
    .where(and(
      eq(assetLinks.ownerType, "job_description"),
      eq(jobTracks.id, input.jobTrackId),
      eq(jobTracks.userId, input.userId),
      eq(assets.userId, input.userId),
    ));
}

export async function uploadJobDescriptionImages(input: { userId: string; jobTrackId: string; files: File[] }) {
  const validated = validateJobDescriptionImages(input.files);
  const db = getDatabaseRuntime().db;
  const [description] = await db.select({ id: jobDescriptions.id }).from(jobDescriptions)
    .innerJoin(jobTracks, eq(jobTracks.id, jobDescriptions.jobTrackId))
    .where(and(eq(jobTracks.id, input.jobTrackId), eq(jobTracks.userId, input.userId))).limit(1);
  if (!description) throw new Error("NOT_FOUND: job description was not found");

  const storage = getPrivateObjectStorage();
  const uploaded: Array<{ id: string; key: string; file: File; bytes: Buffer }> = [];
  try {
    for (const [index, file] of input.files.entries()) {
      const id = randomUUID();
      const key = `${input.userId}/job-descriptions/${input.jobTrackId}/${id}.${validated[index].extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: bytes, ContentType: file.type }));
      uploaded.push({ id, key, file, bytes });
    }

    await db.transaction(async (transaction) => {
      const [position] = await transaction.select({
        value: sql<number>`coalesce(max(${assetLinks.sortOrder}), -1)::int`,
      }).from(assetLinks).where(and(eq(assetLinks.ownerType, "job_description"), eq(assetLinks.ownerId, description.id)));
      const startAt = (position?.value ?? -1) + 1;
      await transaction.insert(assets).values(uploaded.map((item) => ({
        id: item.id,
        userId: input.userId,
        kind: "jd_image" as const,
        storageKey: item.key,
        originalName: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size,
        sha256: createHash("sha256").update(item.bytes).digest("hex"),
      })));
      await transaction.insert(assetLinks).values(uploaded.map((item, index) => ({
        id: randomUUID(),
        assetId: item.id,
        ownerType: "job_description" as const,
        ownerId: description.id,
        sortOrder: startAt + index,
      })));
    });
  } catch (error) {
    await Promise.all(uploaded.map((item) => storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: item.key })).catch(() => undefined)));
    throw error;
  }
  return uploaded.map((item) => ({ id: item.id, originalName: item.file.name, mimeType: item.file.type }));
}

export async function getOwnedAsset(userId: string, assetId: string) {
  const [asset] = await getDatabaseRuntime().db.select({
    id: assets.id,
    storageKey: assets.storageKey,
    originalName: assets.originalName,
    mimeType: assets.mimeType,
    sizeBytes: assets.sizeBytes,
  }).from(assets).where(and(eq(assets.id, assetId), eq(assets.userId, userId))).limit(1);
  if (!asset) throw new Error("NOT_FOUND: asset was not found");
  return asset;
}
