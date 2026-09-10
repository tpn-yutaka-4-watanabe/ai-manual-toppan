import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import handbooksModule from "../server/dist/config/handbooks.js";
import appModule from "../server/dist/app.js";

const { buildHandbookRegistry, toPublicHandbookConfig } = handbooksModule;
const { createApp } = appModule;

const definitions = [
  {
    slug: "alpha-handbook",
    envPrefix: "ALPHA",
    title: "Alpha販売手帳AI",
    source: {
      label: "Alpha source PDF",
      pdfPath: "tests/fixtures/source.pdf",
      imageDir: "tests/fixtures/source-pages",
      pageTags: [
        { tag: "page_1", label: "p.1 Alpha source", sourcePage: 1, pdfPage: 1 },
      ],
    },
  },
  { slug: "beta-handbook", envPrefix: "BETA", title: "Beta販売手帳AI" },
];

function environment(overrides = {}) {
  return {
    ADMIN_AUTH_USERNAME: "admin-user",
    ADMIN_AUTH_PASSWORD: "admin-password",
    ADMIN_AUTH_REALM: "Admin",
    ADMIN_TITLE: "販売基本ルールAI 管理",
    BRAIN_BASE_URL: "http://127.0.0.1:9",
    BRAIN_API_KEY: "shared-api-secret",
    ALPHA_BRAIN_PROJECT_ID: "alpha-project",
    ALPHA_AUTH_USERNAME: "alpha-user",
    ALPHA_AUTH_PASSWORD: "alpha-password",
    BETA_BRAIN_PROJECT_ID: "beta-project",
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

test("all handbooks share the BrainAPI endpoint and API key while keeping separate project IDs", () => {
  const registry = buildHandbookRegistry(definitions, environment());
  const alpha = registry.get("alpha-handbook");
  const beta = registry.get("beta-handbook");

  assert.equal(alpha.brain.baseUrl, beta.brain.baseUrl);
  assert.equal(alpha.brain.apiKey, "shared-api-secret");
  assert.equal(beta.brain.apiKey, "shared-api-secret");
  assert.equal(alpha.brain.projectId, "alpha-project");
  assert.equal(beta.brain.projectId, "beta-project");
});

test("configuration fails closed when the shared BrainAPI key is missing", () => {
  const env = environment();
  delete env.BRAIN_API_KEY;
  assert.throws(
    () => buildHandbookRegistry(definitions, env),
    /BRAIN_API_KEY/,
  );
});

test("admin authentication also fails closed when it is incomplete", () => {
  const env = environment();
  delete env.ADMIN_AUTH_PASSWORD;
  assert.throws(
    () => buildHandbookRegistry(definitions, env),
    /ADMIN_AUTH_PASSWORD/,
  );
});

test("public configuration never includes Brain or authentication secrets", () => {
  const registry = buildHandbookRegistry(definitions, environment());
  const json = JSON.stringify(toPublicHandbookConfig(registry.get("alpha-handbook")));
  assert.equal(json.includes("shared-api-secret"), false);
  assert.equal(json.includes("alpha-password"), false);
  assert.equal(json.includes("alpha-project"), false);
  assert.equal(json.includes("admin-password"), false);
  assert.equal(json.includes("tests/fixtures/source.pdf"), false);
  assert.equal(json.includes("tests/fixtures/source-pages"), false);
  assert.match(json, /"pdfUrl":"\/api\/handbooks\/alpha-handbook\/source\.pdf"/);
  assert.match(json, /"imageUrl":"\/api\/handbooks\/alpha-handbook\/source-pages\/page_1\.png"/);
  assert.match(json, /"tag":"page_1"/);
});

test("legacy Seibu Sogo typo is normalized even when environment configuration overrides the file", () => {
  const registry = buildHandbookRegistry([
    {
      slug: "seibu-sogo-sales-basic-rules",
      envPrefix: "SEIBU_SOGO",
      title: "西部・そごう 販売基本ルールAI",
      assistantLabel: "西部・そごう 販売基本ルールAI",
      initialMessage: "西部・そごう 販売基本ルールAIです。",
    },
  ], environment({
    SEIBU_SOGO_BRAIN_PROJECT_ID: "seibu-sogo-project",
    SEIBU_SOGO_AUTH_USERNAME: "seibu-sogo-user",
    SEIBU_SOGO_AUTH_PASSWORD: "seibu-sogo-password",
    SEIBU_SOGO_AUTH_REALM: "西部・そごう 販売基本ルールAI",
    SEIBU_SOGO_BRAIN_CONNECTION_NAME: "西部・そごう 販売基本ルールAI Brain",
  }));
  const app = registry.get("seibu-sogo-sales-basic-rules");

  assert.equal(app.title, "西武・そごう 販売基本ルールAI");
  assert.equal(app.assistantLabel, "西武・そごう 販売基本ルールAI");
  assert.equal(app.initialMessage, "西武・そごう 販売基本ルールAIです。");
  assert.equal(app.connectionName, "西武・そごう 販売基本ルールAI Brain");
  assert.equal(app.auth.realm, "西武・そごう 販売基本ルールAI");
});

test("legacy TOPPAN generic display name is normalized even when environment configuration overrides the file", () => {
  const registry = buildHandbookRegistry([
    {
      slug: "toppan-generic-sales-handbook",
      envPrefix: "TOPPAN_GENERIC",
      title: "TOPPAN百貨店　販売手帳AI",
      assistantLabel: "TOPPAN百貨店　販売手帳AI",
      initialMessage: "TOPPAN百貨店　販売手帳AIです。",
    },
  ], environment({
    TOPPAN_GENERIC_BRAIN_PROJECT_ID: "toppan-project",
    TOPPAN_GENERIC_AUTH_USERNAME: "toppan-user",
    TOPPAN_GENERIC_AUTH_PASSWORD: "toppan-password",
    TOPPAN_GENERIC_AUTH_REALM: "TOPPAN 汎用販売手帳AI",
    TOPPAN_GENERIC_BRAIN_CONNECTION_NAME: "TOPPAN 汎用販売手帳AI Brain",
  }));
  const app = registry.get("toppan-generic-sales-handbook");

  assert.equal(app.title, "TOPPAN百貨店　販売手帳AI");
  assert.equal(app.assistantLabel, "TOPPAN百貨店　販売手帳AI");
  assert.equal(app.initialMessage, "TOPPAN百貨店　販売手帳AIです。");
  assert.equal(app.connectionName, "TOPPAN百貨店　販売手帳AI Brain");
  assert.equal(app.auth.realm, "TOPPAN百貨店　販売手帳AI");
});

test("admin and handbook URLs enforce separate credentials", async () => {
  const registry = buildHandbookRegistry(definitions, environment());
  const running = await listen(createApp(registry));

  try {
    const anonymousAdmin = await fetch(`${running.baseUrl}/admin`, { redirect: "manual" });
    assert.equal(anonymousAdmin.status, 401, await anonymousAdmin.text());
    assert.match(anonymousAdmin.headers.get("www-authenticate") ?? "", /admin/);

    const adminWithChatUser = await fetch(`${running.baseUrl}/api/admin/handbooks`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(adminWithChatUser.status, 401);

    const adminIndex = await fetch(`${running.baseUrl}/api/admin/handbooks`, {
      headers: { Authorization: basic("admin-user", "admin-password") },
    });
    assert.equal(adminIndex.status, 200);
    assert.deepEqual((await adminIndex.json()).apps.map((item) => item.slug), ["alpha-handbook", "beta-handbook"]);

    const anonymousChat = await fetch(`${running.baseUrl}/chats/alpha-handbook`, { redirect: "manual" });
    assert.equal(anonymousChat.status, 401, await anonymousChat.text());
    assert.match(anonymousChat.headers.get("www-authenticate") ?? "", /alpha-handbook/);

    const chatWithAdminUser = await fetch(`${running.baseUrl}/chats/alpha-handbook`, {
      headers: { Authorization: basic("admin-user", "admin-password") },
    });
    assert.equal(chatWithAdminUser.status, 401);

    const wrongApp = await fetch(`${running.baseUrl}/apps/beta-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(wrongApp.status, 401);

    const page = await fetch(`${running.baseUrl}/chats/alpha-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

    const legacyPage = await fetch(`${running.baseUrl}/apps/alpha-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(legacyPage.status, 200);

    const config = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(config.status, 200);
    const publicConfig = await config.json();
    assert.equal(publicConfig.title, "Alpha販売手帳AI");
    assert.equal(publicConfig.source.label, "Alpha source PDF");
    assert.equal(publicConfig.source.pdfUrl, "/api/handbooks/alpha-handbook/source.pdf");
    assert.deepEqual(publicConfig.source.pageTags, [
      {
        tag: "page_1",
        label: "p.1 Alpha source",
        sourcePage: 1,
        pdfPage: 1,
        imageUrl: "/api/handbooks/alpha-handbook/source-pages/page_1.png",
      },
    ]);

    const anonymousSource = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source.pdf`, { redirect: "manual" });
    assert.equal(anonymousSource.status, 401);

    const sourceWithAdminUser = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source.pdf`, {
      headers: { Authorization: basic("admin-user", "admin-password") },
    });
    assert.equal(sourceWithAdminUser.status, 401);

    const sourcePdf = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source.pdf`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(sourcePdf.status, 200);
    assert.match(sourcePdf.headers.get("content-type") ?? "", /application\/pdf/);
    assert.equal(Buffer.from(await sourcePdf.arrayBuffer()).toString("utf-8", 0, 8), "%PDF-1.1");

    const anonymousSourceImage = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source-pages/page_1.png`, { redirect: "manual" });
    assert.equal(anonymousSourceImage.status, 401);

    const sourceImageWithAdminUser = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source-pages/page_1.png`, {
      headers: { Authorization: basic("admin-user", "admin-password") },
    });
    assert.equal(sourceImageWithAdminUser.status, 401);

    const sourceImage = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source-pages/page_1.png`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(sourceImage.status, 200);
    assert.match(sourceImage.headers.get("content-type") ?? "", /image\/png/);
    assert.equal(Buffer.from(await sourceImage.arrayBuffer()).toString("hex", 0, 8), "89504e470d0a1a0a");

    const missingSourceImage = await fetch(`${running.baseUrl}/api/handbooks/alpha-handbook/source-pages/page_999.png`, {
      headers: { Authorization: basic("alpha-user", "alpha-password") },
    });
    assert.equal(missingSourceImage.status, 404);
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
    BRAIN_BASE_URL: brain.baseUrl,
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
    assert.equal(text.includes("shared-api-secret"), false);
    assert.equal(receivedBody.apiKey, "shared-api-secret");
    assert.equal(receivedBody.projectId, "alpha-project");
    assert.equal(receivedBody.stream, true);
    assert.deepEqual(receivedBody.files, []);
  } finally {
    await running.close();
    await brain.close();
  }
});
