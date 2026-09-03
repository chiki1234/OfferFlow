import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFaqAiGateway } from "@/adapters/ai/openai-compatible-faq";

const environment: NodeJS.ProcessEnv = { NODE_ENV: "test", AI_BASE_URL: "https://ai.example.invalid/v1/", AI_API_KEY: "test-key", AI_MODEL: "test-model", AI_TIMEOUT: "5" };
const requestData = { incoming: [{ id: "new", question: "新问法" }], candidates: [{ id: "old", question: "旧问法" }] };
const response = (content: string, finish_reason = "stop") => Response.json({ choices: [{ finish_reason, message: { content } }] });
let logDirectory: string;

beforeEach(async () => {
  logDirectory = await mkdtemp(join(tmpdir(), "jobhunting-ai-log-test-"));
  environment.AI_LOG_DIR = logDirectory;
});

afterEach(async () => {
  vi.restoreAllMocks();
  // Only remove the unique temporary directory created by this test, never user call logs.
  if (dirname(resolve(logDirectory)) !== resolve(tmpdir()) || !basename(logDirectory).startsWith("jobhunting-ai-log-test-")) throw new Error("Unsafe test cleanup path");
  await rm(logDirectory, { recursive: true, force: true });
});

async function readCallLogs() {
  const files = (await readdir(logDirectory, { recursive: true })).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(logDirectory, file), "utf8"))));
}

describe("FAQ OpenAI-compatible adapter", () => {
  it("共享规则和有序候选形成相同前缀，只有最后一条消息随新问题变化", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response('{"matches":[]}'));
    const gateway = createFaqAiGateway(environment, request);
    await gateway.findClosestMatches({
      candidates: [{ id: "b", question: "历史问题 B" }, { id: "a", question: "历史问题 A" }],
      incoming: [{ id: "new-1", question: "第一种问法" }],
    });
    await gateway.findClosestMatches({
      candidates: [{ id: "a", question: "历史问题 A" }, { id: "b", question: "历史问题 B" }],
      incoming: [{ id: "new-2", question: "第二种问法" }],
    });
    const first = JSON.parse(request.mock.calls[0][1]?.body as string);
    const second = JSON.parse(request.mock.calls[1][1]?.body as string);
    expect(first.messages).toHaveLength(3);
    expect(first.messages.slice(0, 2)).toEqual(second.messages.slice(0, 2));
    expect(first.messages[1]).toEqual({ role: "user", content: '{"candidates":[{"id":"a","question":"历史问题 A"},{"id":"b","question":"历史问题 B"}]}' });
    expect(first.messages[2]).toEqual({ role: "user", content: '{"incoming":[{"id":"new-1","question":"第一种问法"}]}' });
    expect(second.messages[2]).toEqual({ role: "user", content: '{"incoming":[{"id":"new-2","question":"第二种问法"}]}' });
  });

  it("按 Chat Completions JSON 协议请求，并解析唯一匹配", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(JSON.stringify({ matches: [{ incomingFaqId: "new", existingFaqId: "old" }] })));
    const gateway = createFaqAiGateway(environment, request);
    expect(await gateway.findClosestMatches(requestData)).toEqual([{ incomingFaqId: "new", existingFaqId: "old" }]);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://ai.example.invalid/v1/chat/completions");
    expect(options?.headers).toEqual({ Authorization: "Bearer test-key", "Content-Type": "application/json" });
    const body = JSON.parse(options?.body as string);
    expect(body.model).toBe("test-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(body.messages[1].content)).toEqual({ candidates: requestData.candidates });
    expect(JSON.parse(body.messages[2].content)).toEqual({ incoming: requestData.incoming });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("发出请求前记录调用中，返回后保存完整请求响应、时间、状态及上下文", async () => {
    const providerBody = JSON.stringify({
      id: "completion-123", model: "provider-model", extra: { untouched: "完整内容".repeat(75000) },
      usage: { prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1024 } },
      choices: [{ finish_reason: "stop", message: { content: '{"matches":[{"incomingFaqId":"new","existingFaqId":"old"}]}' } }],
    });
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const [running] = await readCallLogs();
      expect(running).toMatchObject({ status: "running", operation: "faq_similarity", response: null, error: null, finishedAt: null, durationMs: null });
      expect(running.request.body).toEqual(JSON.parse(options!.body as string));
      return new Response(providerBody, { headers: { "x-request-id": "provider-request-1", "content-type": "application/json" } });
    });
    await createFaqAiGateway(environment, request, { userId: "user-1", batchId: "batch-1" }).findClosestMatches(requestData);
    const logs = await readCallLogs();
    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log).toMatchObject({ version: 1, status: "succeeded", operation: "faq_similarity", context: { userId: "user-1", batchId: "batch-1" }, model: "test-model", error: null });
    expect(log.response).toMatchObject({ status: 200, bodyComplete: true, body: providerBody, headers: { "x-request-id": "provider-request-1" } });
    expect(log.request).toMatchObject({ method: "POST", url: "https://ai.example.invalid/v1/chat/completions", headers: { Authorization: "[REDACTED]", "Content-Type": "application/json" } });
    expect(log.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(log.finishedAt)).toBeGreaterThanOrEqual(Date.parse(log.startedAt));
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(log)).not.toContain("test-key");
  });

  it("答案仅在调用 mergeAnswers 时生成", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response('{"answer":" 合并答案 "}'));
    const gateway = createFaqAiGateway(environment, request);
    expect(request).not.toHaveBeenCalled();
    expect(await gateway.mergeAnswers({ question: "问题", answers: ["旧答案", "新答案"] })).toBe("合并答案");
    expect(request).toHaveBeenCalledTimes(1);
    const [log] = await readCallLogs();
    expect(log).toMatchObject({ status: "succeeded", operation: "faq_answer_merge" });
    expect(log.request.body.messages[1].content).toBe('{"question":"问题","answers":["旧答案","新答案"]}');
    expect(JSON.parse(log.response.body).choices[0].message.content).toBe('{"answer":" 合并答案 "}');
  });

  it.each(["length", "content_filter"])("拒绝不完整的 %s 结果", async (reason) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response('{"matches":[]}', reason));
    await expect(createFaqAiGateway(environment, request).findClosestMatches(requestData)).rejects.toThrow("AI_RESPONSE_INVALID");
    expect((await readCallLogs())[0]).toMatchObject({ status: "failed", error: { type: "invalid_response" } });
  });

  it("服务故障不暴露供应商原始响应", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider detail", { status: 401 }));
    await expect(createFaqAiGateway(environment, request).findClosestMatches(requestData)).rejects.toThrow("AI_UNAVAILABLE: AI 服务返回 HTTP 401");
    expect((await readCallLogs())[0]).toMatchObject({ status: "failed", response: { status: 401, body: "private provider detail", bodyComplete: true }, error: { type: "http_error" } });
  });

  it("正文完整保留但认证头、Cookie 和服务商回显的 Key 必须脱敏", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid key test-key; provider detail", {
      status: 401,
      headers: { "set-cookie": "private-session=secret", "x-api-key": "another-secret", "x-request-id": "req-safe", "x-ratelimit-remaining-tokens": "500" },
    }));
    await expect(createFaqAiGateway(environment, request).findClosestMatches(requestData)).rejects.toThrow("HTTP 401");
    const [log] = await readCallLogs();
    expect(log.response.body).toBe("invalid key [REDACTED]; provider detail");
    expect(log.response.headers).toMatchObject({ "set-cookie": "[REDACTED]", "x-api-key": "[REDACTED]", "x-request-id": "req-safe", "x-ratelimit-remaining-tokens": "500" });
    expect(JSON.stringify(log)).not.toMatch(/test-key|private-session|another-secret/);
  });

  it.each([
    [new TypeError("connection failed test-key"), "network_error"],
    [new DOMException("request timed out test-key", "TimeoutError"), "timeout"],
  ])("连接或超时失败也留下记录且不泄露密钥：%s", async (error, type) => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(createFaqAiGateway(environment, request).findClosestMatches(requestData)).rejects.toThrow("AI_UNAVAILABLE");
    const [log] = await readCallLogs();
    expect(log).toMatchObject({ status: "failed", response: null, error: { type } });
    expect(log.finishedAt).not.toBeNull();
    expect(log.error.message).toContain("[REDACTED]");
  });

  it.each(["not JSON", JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"matches":"wrong shape"}' } }] })])("完整保留格式错误的响应并标记失败：%s", async (body) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(createFaqAiGateway(environment, request).findClosestMatches(requestData)).rejects.toThrow("AI_RESPONSE_INVALID");
    expect((await readCallLogs())[0]).toMatchObject({ status: "failed", response: { status: 200, body, bodyComplete: true }, error: { type: "invalid_response" } });
  });

  it("接收途中断线时保留已收到的响应并明确标记不完整", async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      if (sent) controller.error(new Error("socket closed"));
      else { sent = true; controller.enqueue(new TextEncoder().encode('{"partial":')); }
    } });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expect(createFaqAiGateway(environment, request).findClosestMatches(requestData)).rejects.toThrow("AI_UNAVAILABLE");
    expect((await readCallLogs())[0]).toMatchObject({ status: "failed", response: { status: 200, body: '{"partial":', bodyComplete: false }, error: { type: "network_error" } });
  });

  it("不同调用各有独立记录，失败后重试不覆盖原始错误", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("rate limited", { status: 429 })).mockImplementation(async () => response('{"matches":[]}'));
    const gateway = createFaqAiGateway(environment, request);
    await expect(gateway.findClosestMatches(requestData)).rejects.toThrow("HTTP 429");
    await Promise.all([gateway.findClosestMatches(requestData), gateway.findClosestMatches(requestData)]);
    const logs = await readCallLogs();
    expect(logs).toHaveLength(3);
    expect(new Set(logs.map((log) => log.id)).size).toBe(3);
    expect(logs.filter((log) => log.status === "failed")).toHaveLength(1);
    expect(logs.filter((log) => log.status === "succeeded")).toHaveLength(2);
  });

  it("日志目录不可写时明确失败且不发出无记录的请求", async () => {
    const blocked = join(logDirectory, "not-a-directory");
    await writeFile(blocked, "test fixture");
    const request = vi.fn<typeof fetch>();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createFaqAiGateway({ ...environment, AI_LOG_DIR: blocked }, request).findClosestMatches(requestData)).rejects.toThrow("AI_LOG_UNAVAILABLE");
    expect(request).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("AI call log could not be saved"));
  });

  it.each(["public/ai-logs", ".next/static/ai-logs", "out/ai-logs"])("拒绝将私密日志保存到公开目录：%s", async (path) => {
    const request = vi.fn<typeof fetch>();
    await expect(createFaqAiGateway({ ...environment, AI_LOG_DIR: resolve(path) }, request).findClosestMatches(requestData)).rejects.toThrow("不能保存到公开资源目录");
    expect(request).not.toHaveBeenCalled();
  });

  it("输入超限不截断或发送部分候选", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(createFaqAiGateway(environment, request).findClosestMatches({ ...requestData, candidates: [{ id: "old", question: "a".repeat(200001) }] })).rejects.toThrow("AI_INPUT_TOO_LARGE");
    expect(request).not.toHaveBeenCalled();
    expect(await readCallLogs()).toHaveLength(0);
  });
});
