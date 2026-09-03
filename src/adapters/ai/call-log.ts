import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type AiCallContext = { userId?: string; batchId?: string };
export type AiCallOperation = "faq_similarity" | "faq_answer_merge";
export type AiCallResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyComplete: boolean;
};
export type AiCallError = {
  type: "http_error" | "network_error" | "timeout" | "invalid_response";
  name: string;
  message: string;
};

const sensitiveField = /(?:^|[-_])(?:authorization|cookie|secret|credential|api[-_]?key|token)(?:$|[-_])/i;

function within(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

export async function startAiCallLog(input: {
  operation: AiCallOperation;
  context: AiCallContext;
  model: string;
  url: string;
  body: string;
  apiKey: string;
}, environment: NodeJS.ProcessEnv) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const id = randomUUID();
  // Logs are runtime output, never build inputs. Do not trace private files into the deployment.
  const root = resolve(/* turbopackIgnore: true */ environment.AI_LOG_DIR?.trim() || ".runtime/logs/ai");
  if (["public", ".next/static", "out"].some((path) => within(resolve(path), root))) {
    throw new Error("AI_LOG_UNAVAILABLE: AI 日志包含私密内容，不能保存到公开资源目录。");
  }
  const directory = join(/* turbopackIgnore: true */ root, startedAt.slice(0, 10));
  const file = join(/* turbopackIgnore: true */ directory, `${startedAt.slice(11, 23).replace(/[:.]/g, "-")}-${input.operation}-${id}.json`);
  const secrets = [...new Set([input.apiKey, JSON.stringify(input.apiKey).slice(1, -1), encodeURIComponent(input.apiKey)])].filter(Boolean);
  const record = {
    version: 1, id, operation: input.operation, context: input.context, model: input.model,
    status: "running", startedAt, finishedAt: null as string | null, durationMs: null as number | null,
    request: { method: "POST", url: input.url, headers: { "Content-Type": "application/json", Authorization: "[REDACTED]" }, body: JSON.parse(input.body) as unknown },
    response: null as AiCallResponse | null,
    error: null as AiCallError | null,
  };

  async function save() {
    const serialized = JSON.stringify(record, (key, value: unknown) => {
      if (sensitiveField.test(key)) return "[REDACTED]";
      if (typeof value === "string") return secrets.reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value);
      return value;
    }, 2);
    // One file per call avoids interleaving between users/workers. Publish complete JSON atomically.
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(temporary, `${serialized}\n`, { encoding: "utf8", flag: "wx", mode: 0o600, flush: true });
      await rename(temporary, file);
    } catch {
      // Do not print request/response bodies, credentials or arbitrary filesystem errors to shared logs.
      console.error("AI call log could not be saved; check AI_LOG_DIR permissions and available disk space.");
      throw new Error("AI_LOG_UNAVAILABLE: 无法保存 AI 调用日志，请检查服务端日志目录权限和磁盘空间。");
    }
  }

  // If this fails, no provider request is sent without a corresponding start record.
  await save();
  return {
    async finish(response: AiCallResponse | null, error: AiCallError | null) {
      record.status = error ? "failed" : "succeeded";
      record.finishedAt = new Date().toISOString();
      record.durationMs = Math.max(0, Math.round(performance.now() - started));
      record.response = response;
      record.error = error;
      await save();
    },
  };
}
