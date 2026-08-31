import type { PublicHandbookConfig, StreamPayload } from "./types";

type StreamHandlers = {
  onConnection: (name: string) => void;
  onMessage: (message: string, state?: unknown) => void;
  onDone: (payload: StreamPayload) => void;
};

function findDelimiter(buffer: string) {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  const lfIndex = buffer.indexOf("\n\n");
  if (crlfIndex === -1) return lfIndex;
  if (lfIndex === -1) return crlfIndex;
  return Math.min(crlfIndex, lfIndex);
}

function delimiterLength(buffer: string, index: number) {
  return buffer.startsWith("\r\n\r\n", index) ? 4 : 2;
}

function parseEvent(chunk: string) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.trim().split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return dataLines.length > 0 ? { event, data: dataLines.join("\n") } : null;
}

function parsePayload(data: string): StreamPayload {
  try {
    return JSON.parse(data) as StreamPayload;
  } catch {
    return { message: data };
  }
}

async function readError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string };
    return payload.message || `HTTP ${response.status}`;
  }
  const text = (await response.text()).trim();
  return text || `HTTP ${response.status}`;
}

export async function fetchHandbookConfig(slug: string) {
  const response = await fetch(`/api/handbooks/${encodeURIComponent(slug)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as PublicHandbookConfig;
}

export async function fetchHandbookIndex() {
  const response = await fetch("/api/handbooks", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as PublicHandbookConfig[];
}

export async function streamChat(
  slug: string,
  input: { utterance: string; uid: string; state?: unknown },
  handlers: StreamHandlers,
) {
  const response = await fetch(`/api/handbooks/${encodeURIComponent(slug)}/chat/stream`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  if (!response.body) {
    throw new Error("応答ストリームを受信できませんでした。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleChunk = (chunk: string) => {
    const parsed = parseEvent(chunk);
    if (!parsed) return;
    const payload = parsePayload(parsed.data);
    if (parsed.event === "error") {
      throw new Error(payload.message || "販売手帳AIへの送信に失敗しました。");
    }
    if (parsed.event === "connection") {
      handlers.onConnection(payload.connection?.name || "");
    } else if (parsed.event === "done") {
      handlers.onDone(payload);
    } else {
      handlers.onMessage(payload.message || "", payload.state);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = findDelimiter(buffer);
    while (index >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + delimiterLength(buffer, index));
      handleChunk(chunk);
      index = findDelimiter(buffer);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleChunk(buffer);
  }
}

