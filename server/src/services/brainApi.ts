import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { readSseStream } from "../utils/stream";

export type BrainPredictionInput = {
  utterance: string;
  projectId: string;
  apiKey: string;
  uid: string;
  baseUrl: string;
  state?: unknown;
};

type BrainPredictionResult = {
  message: string;
  raw: unknown;
  state?: unknown;
};

function requestTimeoutMs() {
  const configured = Number(process.env.BRAIN_REQUEST_TIMEOUT_MS ?? "180000");
  return Number.isFinite(configured) && configured >= 1000 ? configured : 180000;
}

function extractNestedText(payload: unknown, depth = 0): string {
  if (depth > 4) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const text = extractNestedText(item, depth + 1);
      if (text.trim()) {
        return text;
      }
    }
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["content", "text", "message", "answer", "response", "output", "utterance", "value", "body"]) {
    const text = extractNestedText(record[key], depth + 1);
    if (text.trim()) {
      return text;
    }
  }
  return "";
}

function extractMessage(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["message", "content", "text", "output", "response", "answer", "utterance"]) {
    const text = extractNestedText(record[key]);
    if (text.trim()) {
      return text;
    }
  }

  if (Array.isArray(record.messages)) {
    const lastText = [...record.messages]
      .reverse()
      .map((item) => extractNestedText(item))
      .find((item) => item.trim());
    return lastText ?? "";
  }

  return "";
}

function extractChunkText(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["delta", "chunk", "token", "content", "message", "text", "utterance"]) {
    const text = extractNestedText(record[key]);
    if (text) {
      return text;
    }
  }
  return extractMessage(payload);
}

function extractState(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return (payload as Record<string, unknown>).state;
}

function parseMaybeJson(rawText: string): unknown {
  try {
    return rawText ? (JSON.parse(rawText) as unknown) : {};
  } catch {
    return rawText;
  }
}

function mergeStreamText(current: string, incoming: string) {
  if (!incoming) {
    return current;
  }
  if (!current || incoming.startsWith(current)) {
    return incoming;
  }
  return `${current}${incoming}`;
}

function getHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function readResponseText(response: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    response.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    response.on("error", reject);
  });
}

function assertSuccessfulResponse(statusCode: number | undefined, raw: unknown) {
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    return;
  }
  const upstreamMessage = extractMessage(raw).trim();
  const suffix = upstreamMessage ? ` ${upstreamMessage}` : "";
  throw new Error(`BrainAPI returned status ${statusCode ?? "unknown"}.${suffix}`);
}

function requestPrediction(input: BrainPredictionInput, stream: boolean) {
  const targetUrl = new URL("/api/v1/prediction", input.baseUrl);
  const body = JSON.stringify({
    utterance: input.utterance,
    projectId: input.projectId,
    apiKey: input.apiKey,
    uid: input.uid,
    stream,
    state: input.state,
    files: [],
  });
  const transport = targetUrl.protocol === "https:" ? https : http;

  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || undefined,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      resolve,
    );

    request.setTimeout(requestTimeoutMs(), () => {
      request.destroy(new Error("BrainAPI request timed out."));
    });
    request.on("error", reject);
    request.end(body);
  });
}

export async function streamPredictionRequest(
  input: BrainPredictionInput,
  handlers: {
    onMessage: (payload: { delta: string; state?: unknown }) => Promise<void> | void;
    onDone: (payload: BrainPredictionResult) => Promise<void> | void;
  },
) {
  const response = await requestPrediction(input, true);
  const contentType = getHeader(response.headers, "content-type");

  if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
    const raw = parseMaybeJson(await readResponseText(response));
    assertSuccessfulResponse(response.statusCode, raw);
  }

  if (!contentType.includes("text/event-stream")) {
    const raw = parseMaybeJson(await readResponseText(response));
    await handlers.onDone({ message: extractMessage(raw), raw, state: extractState(raw) });
    return;
  }

  const webStream = Readable.toWeb(response) as ReadableStream<Uint8Array>;
  let message = "";
  let state: unknown;
  let donePayload: unknown = {};

  await readSseStream(webStream, async (event) => {
    const raw = parseMaybeJson(event.data);
    if (event.event === "error") {
      throw new Error(extractMessage(raw) || "BrainAPI stream returned an error.");
    }
    if (event.event === "done") {
      donePayload = raw;
      message = extractMessage(raw) || message;
      state = extractState(raw) ?? state;
      return;
    }

    const delta = extractChunkText(raw);
    message = mergeStreamText(message, delta);
    state = extractState(raw) ?? state;
    await handlers.onMessage({ delta, state });
  });

  await handlers.onDone({ message, raw: donePayload, state });
}

