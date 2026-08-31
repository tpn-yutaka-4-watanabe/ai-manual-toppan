import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import handbooksModule from "../server/dist/config/handbooks.js";
import appModule from "../server/dist/app.js";

const { buildHandbookRegistry, toPublicHandbookConfig } = handbooksModule;
const { createApp } = appModule;

const definitions = [
  { slug: "alpha-handbook", envPrefix: "ALPHA", title: "Alpha販売手帳AI" },
  { slug: "beta-handbook", envPrefix: "BETA", title: "Beta販売手帳AI" },
];

function environment(overrides = {}) {
  return {
    ALPHA_BRAIN_BASE_URL: "http://127.0.0.1:9",
    ALPHA_BRAIN_PROJECT_ID: "alpha-project",
    ALPHA_BRAIN_API_KEY: "alpha-api-secret",
    ALPHA_AUTH_USERNAME: "alpha-user",
    ALPHA_AUTH_PASSWORD: "alpha-password",
    BETA_BRAIN_BASE_URL: "http://127.0.0.1:9",
    BETA_BRAIN_PROJECT_ID: "beta-project",
    BETA_BRAIN_API_KEY: "beta-api-secret",
    BETA_AUTH_USERNAME: "beta-user",
    BETA_AUTH_PASSWORD: "beta-password",
    ...overrides,
  };
}

function basic(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("configuration fails closed when a required secret is missing", () => {
  const env = environment();
  delete env.ALPHA_AUTH_PASSWORD;
  assert.throws(
    () => buildHandbookRegistry(definitions, env),
    /ALPHA_AUTH_PASSWORD/,
  );
});

test("public configuration never includes Brain or authentication secrets", () => {
  const registry = buildHandbookRegistry(definitions, environment());
  const json = JSON.stringify(toPublicHandbookConfig(registry.get("alpha-handbook")));
  assert.equal(json.includes("alpha-api-secret"), false);
  assert.equal(json.includes("alpha-password"), false);
  assert.equal(json.includes("alpha-project"), false);
});

test("each handbook URL and API enforce their own credentials", async () => {
  const registry = buildHandbookRegistry(definitions, environment());
  const running = await listen(createApp(registry));

  try {
    const anonymous = await fetch(`${running.baseUrl}/apps/alpha-handbook`, { redirect: "manual" });
    assert.equal(anonymous.status, 401, await anonymous.text());
    assert.match(anonymous.headers.get("www-authenticate") ?? "", /alpha-handbook/);

    const wrongApp = await fetch(`${running.baseUrl}/apps/beta-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(wrongApp.status, 401);

    const page = await fetch(`${running.baseUrl}/apps/alpha-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

    const config = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(config.status, 200);
    assert.equal((await config.json()).title, "Alpha販売手帳AI");
  } finally {
    await running.close();
  }
});

test("BrainAPI SSE is proxied without exposing its API key to the browser", async () => {
  let receivedBody;
  const brain = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
    res.end([
      "event: message",
      'data: {"delta":"販売"}',
      "",
      "event: message",
      'data: {"delta":"手帳の回答"}',
      "",
      "event: done",
      'data: {"message":"販売手帳の回答","state":{"step":2},"quickReplies":["次の質問"]}',
      "",
      "",
    ].join("\n"));
  });

  const registry = buildHandbookRegistry([definitions[0]], environment({
    ALPHA_BRAIN_BASE_URL: brain.baseUrl,
  }));
  const running = await listen(createApp(registry));

  try {
    const response = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/chat/stream`, {
      method: "POST",
      headers: {
        Authorization: basic("alpha-user", "alpha-password"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ utterance: "質問です", uid: "test-session" }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /event: message/);
    assert.match(text, /販売手帳の回答/);
    assert.match(text, /次の質問/);
    assert.equal(text.includes("alpha-api-secret"), false);
    assert.equal(receivedBody.apiKey, "alpha-api-secret");
    assert.equal(receivedBody.projectId, "alpha-project");
    assert.equal(receivedBody.stream, true);
    assert.deepEqual(receivedBody.files, []);
  } finally {
    await running.close();
    await brain.close();
  }
});
