import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { BasicAuthCredential, HandbookRegistry } from "../config/handbooks";

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseAuthorization(header: string | undefined) {
  const match = header?.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf-8");
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function matchesCredential(
  actual: { username: string; password: string },
  expected: BasicAuthCredential,
) {
  return safeCompare(actual.username, expected.username) && safeCompare(actual.password, expected.password);
}

function challenge(res: Response, realm: string, slug: string) {
  const asciiRealm = realm
    .replace(/["\\]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  const safeRealm = `${asciiRealm || "Sales Handbook AI"} (${slug})`;
  res.setHeader("WWW-Authenticate", `Basic realm="${safeRealm}", charset="UTF-8"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  res.status(401).type("text/plain").send("Authentication required.");
}

export function requireHandbookAuth(registry: HandbookRegistry) {
  return (req: Request, res: Response, next: NextFunction) => {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const app = registry.get(slug);
    if (!app) {
      res.status(404).type("text/plain").send("Not found.");
      return;
    }

    const actual = parseAuthorization(req.header("authorization"));
    if (!actual || !app.auth.credentials.some((expected) => matchesCredential(actual, expected))) {
      challenge(res, app.auth.realm, app.slug);
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    next();
  };
}
