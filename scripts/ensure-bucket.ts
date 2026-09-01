import { config } from "dotenv";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getPrivateObjectStorage } from "../src/adapters/storage/private-object-storage";

config({ path: [".env.local", ".env"] });

const storage = getPrivateObjectStorage();

try {
  await storage.client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
  console.log(`Object-storage bucket already exists: ${storage.bucket}`);
} catch (error) {
  if (!isMissingBucket(error)) throw error;
  await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
  console.log(`Created object-storage bucket: ${storage.bucket}`);
}

function isMissingBucket(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "$metadata" in error
    ? (error.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode
    : undefined;
  return status === 404 || ("name" in error && error.name === "NoSuchBucket");
}
