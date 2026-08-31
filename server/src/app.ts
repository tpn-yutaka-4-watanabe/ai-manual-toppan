import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { HandbookRegistry } from "./config/handbooks";
import { requireHandbookAuth } from "./services/basicAuth";
import { createHandbooksRouter } from "./routes/handbooks";

function resolveClientDistPath() {
  const candidates = [
    path.resolve(__dirname, "../../client/dist"),
    path.resolve(process.cwd(), "client/dist"),
    path.resolve(process.cwd(), "../client/dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html")));
}

export function createApp(registry: HandbookRegistry) {
  const app = express();

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "ai-manual-toppan",
      handbookCount: registry.apps.length,
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/handbooks", createHandbooksRouter(registry));

  const clientDistPath = resolveClientDistPath();
  if (clientDistPath) {
    app.use("/assets", express.static(path.join(clientDistPath, "assets"), {
      immutable: true,
      maxAge: "1y",
    }));

    const authorize = requireHandbookAuth(registry);
    app.get("/apps/:slug", authorize, (_req, res) => {
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
    app.get("/", (_req, res) => {
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  } else {
    app.get(["/", "/apps/:slug"], (_req, res) => {
      res.status(503).type("text/plain").send("Client build not found. Run npm run build.");
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    res.status(400).json({ message });
  });

  app.use((_req, res) => {
    res.status(404).type("text/plain").send("Not found.");
  });

  return app;
}

