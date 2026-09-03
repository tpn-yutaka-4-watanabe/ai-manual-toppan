import { Router, type RequestHandler } from "express";
import fs from "node:fs";
import path from "node:path";
import type { HandbookRegistry } from "../config/handbooks";
import { toPublicHandbookConfig } from "../config/handbooks";
import { requireHandbookAuth } from "../services/basicAuth";
import { streamPredictionRequest } from "../services/brainApi";

const quickReplyKeys = new Set([
  "quick_replies",
  "quickReplies",
  "quick_reply",
  "quickReply",
  "suggested_questions",
  "suggestedQuestions",
  "suggestions",
  "next_questions",
  "nextQuestions",
  "follow_up_questions",
  "followUpQuestions",
  "question_candidates",
  "questionCandidates",
  "options",
  "prompts",
  "buttons",
]);

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function candidateToText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of ["text", "label", "title", "utterance", "prompt", "message", "value"]) {
    const text = candidateToText(record[key]);
    if (text) {
      return text;
    }
  }
  return "";
}

function collectQuickReplies(value: unknown, output: string[], depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectQuickReplies(item, output, depth + 1));
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (quickReplyKeys.has(key)) {
      const candidates = Array.isArray(nested) ? nested : [nested];
      candidates.forEach((candidate) => {
        const text = candidateToText(candidate);
        if (text) {
          output.push(text);
        }
      });
    } else {
      collectQuickReplies(nested, output, depth + 1);
    }
  }
}

function extractQuickReplies(raw: unknown) {
  const output: string[] = [];
  collectQuickReplies(raw, output);
  return [...new Set(output.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 6);
}

function validateRequest(body: unknown) {
  const payload = (body ?? {}) as Record<string, unknown>;
  const utterance = typeof payload.utterance === "string" ? payload.utterance.trim() : "";
  const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";

  if (!utterance || utterance.length > 10_000) {
    throw new Error("utterance is required and must be 10,000 characters or fewer.");
  }
  if (!uid || uid.length > 256) {
    throw new Error("uid is required and must be 256 characters or fewer.");
  }

  return { utterance, uid, state: payload.state };
}

function writeEvent(res: Parameters<RequestHandler>[1], event: string, payload: Record<string, unknown>) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function routeSlug(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function pageTag(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function createHandbooksRouter(registry: HandbookRegistry) {
  const router = Router();
  const authorize = requireHandbookAuth(registry);

  router.get("/", (_req, res) => {
    res.json(registry.indexEnabled ? registry.listPublic() : []);
  });

  router.get("/:slug/source.pdf", authorize, (req, res, next) => {
    const app = registry.get(routeSlug(req.params.slug))!;
    if (!app.source?.pdfPath) {
      res.status(404).type("text/plain").send("Source PDF is not configured for this handbook.");
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${app.slug}-source.pdf"`);
    res.type("application/pdf");
    res.sendFile(app.source.pdfPath, (error) => {
      if (error) next(error);
    });
  });

  router.get("/:slug/source-pages/:tag.png", authorize, (req, res, next) => {
    const app = registry.get(routeSlug(req.params.slug))!;
    const tag = pageTag(req.params.tag);
    const sourcePage = app.source?.pageTags.find((item) => item.tag === tag);
    if (!app.source?.imageDir || !sourcePage) {
      res.status(404).type("text/plain").send("Source page image is not configured for this handbook.");
      return;
    }

    const imagePath = path.join(app.source.imageDir, `${sourcePage.tag}.png`);
    if (!fs.existsSync(imagePath)) {
      res.status(404).type("text/plain").send("Source page image was not found.");
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.type("image/png");
    res.sendFile(imagePath, (error) => {
      if (error) next(error);
    });
  });

  router.get("/:slug", authorize, (req, res) => {
    const app = registry.get(routeSlug(req.params.slug))!;
    res.json(toPublicHandbookConfig(app));
  });

  router.post("/:slug/chat/stream", authorize, asyncHandler(async (req, res) => {
    const app = registry.get(routeSlug(req.params.slug))!;
    const input = validateRequest(req.body);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    writeEvent(res, "connection", { connection: { name: app.connectionName } });
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);

    try {
      await streamPredictionRequest(
        {
          utterance: input.utterance,
          uid: input.uid,
          state: input.state,
          projectId: app.brain.projectId,
          apiKey: app.brain.apiKey,
          baseUrl: app.brain.baseUrl,
        },
        {
          onMessage: ({ delta, state }) => writeEvent(res, "message", { message: delta, state }),
          onDone: ({ message, raw, state }) => writeEvent(res, "done", {
            message,
            state,
            quickReplies: extractQuickReplies(raw),
            connection: { name: app.connectionName },
          }),
        },
      );
    } catch (error) {
      console.error(`[${app.slug}] BrainAPI request failed:`, error);
      writeEvent(res, "error", { message: `${app.title}への送信に失敗しました。` });
    } finally {
      clearInterval(keepAlive);
      res.end();
    }
  }));

  return router;
}
