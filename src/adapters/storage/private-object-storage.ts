import { S3Client } from "@aws-sdk/client-s3";

export function getPrivateObjectStorage() {
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
