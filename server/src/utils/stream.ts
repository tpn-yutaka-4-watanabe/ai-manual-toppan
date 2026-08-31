export type SseEvent = {
  event: string;
  data: string;
};

function findDelimiter(buffer: string) {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  const lfIndex = buffer.indexOf("\n\n");

  if (crlfIndex === -1) {
    return lfIndex;
  }
  if (lfIndex === -1) {
    return crlfIndex;
  }
  return Math.min(crlfIndex, lfIndex);
}

function delimiterLength(buffer: string, index: number) {
  return buffer.startsWith("\r\n\r\n", index) ? 4 : 2;
}

function parseChunk(chunk: string): SseEvent | null {
  const trimmed = chunk.trim();
  if (!trimmed) {
    return null;
  }

  let event = "message";
  const dataLines: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => Promise<void> | void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let index = findDelimiter(buffer);
    while (index >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + delimiterLength(buffer, index));
      const event = parseChunk(chunk);
      if (event) {
        await onEvent(event);
      }
      index = findDelimiter(buffer);
    }
  }

  buffer += decoder.decode();
  const event = parseChunk(buffer);
  if (event) {
    await onEvent(event);
  }
}

