import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assets, resumes } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { validateResumeUpload } from "./validation";

export async function uploadResumeVersion(input: { userId: string; file: File; name?: string }) {
  const { extension } = validateResumeUpload(input.file);
  const storage = getStorageRuntime();
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const assetId = randomUUID();
  const resumeId = randomUUID();
  const storageKey = `${input.userId}/resumes/${assetId}.${extension}`;
  await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: storageKey,
    Body: bytes,
    ContentType: input.file.type,
  }));

  try {
    await getDatabaseRuntime().db.transaction(async (transaction) => {
      await transaction.insert(assets).values({
        id: assetId,
        userId: input.userId,
        kind: "resume",
        storageKey,
        originalName: input.file.name,
        mimeType: input.file.type,
        sizeBytes: input.file.size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      await transaction.insert(resumes).values({
        id: resumeId,
        userId: input.userId,
        name: input.name?.trim() || input.file.name.replace(/\.(pdf|docx)$/i, ""),
        assetId,
      });
    });
  } catch (error) {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey })).catch(() => undefined);
    throw error;
  }
  return { id: resumeId, name: input.name?.trim() || input.file.name };
}

function getStorageRuntime() {
  const endpoint = requiredEnv("S3_ENDPOINT");
  const bucket = requiredEnv("S3_BUCKET");
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: requiredEnv("S3_REGION"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: requiredEnv("S3_ACCESS_KEY"),
        secretAccessKey: requiredEnv("S3_SECRET_KEY"),
      },
    }),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
