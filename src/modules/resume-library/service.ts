import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray } from "drizzle-orm";
import { getPrivateObjectStorage } from "@/adapters/storage/private-object-storage";
import { assets, experiences, resumeExperiences, resumes } from "@/db/schema";
import { getDatabaseRuntime } from "@/db/runtime";
import { validateResumeExperienceSelection, validateResumeUpload } from "./validation";

export async function uploadResumeVersion(input: {
  userId: string;
  file: File;
  name?: string;
  experienceIds?: string[];
  newExperienceNames?: string[];
  requireExperience?: boolean;
}) {
  const { extension } = validateResumeUpload(input.file);
  const { experienceIds, newExperienceNames } = validateResumeExperienceSelection({
    experienceIds: input.experienceIds ?? [],
    newExperienceNames: input.newExperienceNames ?? [],
    required: input.requireExperience,
  });
  const storage = getPrivateObjectStorage();
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
      if (experienceIds.length) {
        const owned = await transaction.select({ id: experiences.id }).from(experiences)
          .where(and(eq(experiences.userId, input.userId), inArray(experiences.id, experienceIds)));
        if (owned.length !== experienceIds.length) throw new Error("NOT_FOUND: one or more experiences were not found");
      }
      const createdExperiences = newExperienceNames.map((name) => ({ id: randomUUID(), userId: input.userId, name, content: "" }));
      if (createdExperiences.length) await transaction.insert(experiences).values(createdExperiences);
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
      const linkedExperienceIds = [...experienceIds, ...createdExperiences.map(({ id }) => id)];
      if (linkedExperienceIds.length) {
        await transaction.insert(resumeExperiences).values(
          linkedExperienceIds.map((experienceId, sortOrder) => ({ resumeId, experienceId, sortOrder })),
        );
      }
    });
  } catch (error) {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: storageKey })).catch(() => undefined);
    throw error;
  }
  return { id: resumeId, name: input.name?.trim() || input.file.name, experienceCount: experienceIds.length + newExperienceNames.length };
}
