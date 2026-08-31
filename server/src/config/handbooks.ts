import fs from "node:fs";
import path from "node:path";

export type HandbookDefinition = {
  slug: string;
  envPrefix: string;
  title: string;
  assistantLabel?: string;
  inputPlaceholder?: string;
  initialMessage?: string;
};

export type BasicAuthCredential = {
  username: string;
  password: string;
};

export type AuthConfig = {
  realm: string;
  credentials: BasicAuthCredential[];
};

export type AdminConfig = {
  title: string;
  auth: AuthConfig;
};

export type HandbookApp = {
  slug: string;
  title: string;
  assistantLabel: string;
  inputPlaceholder: string;
  initialMessage: string;
  connectionName: string;
  brain: {
    baseUrl: string;
    projectId: string;
    apiKey: string;
  };
  auth: AuthConfig;
};

export type PublicHandbookConfig = Pick<
  HandbookApp,
  "slug" | "title" | "assistantLabel" | "inputPlaceholder" | "initialMessage" | "connectionName"
>;

export type HandbookRegistry = {
  apps: HandbookApp[];
  admin: AdminConfig;
  indexEnabled: boolean;
  get(slug: string): HandbookApp | undefined;
  listPublic(): PublicHandbookConfig[];
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const envPrefixPattern = /^[A-Z][A-Z0-9_]*$/;

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function asNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function parseDefinitions(raw: string, sourceName: string): HandbookDefinition[] {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`${sourceName} could not be parsed: ${detail}`);
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${sourceName} must be a non-empty JSON array.`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${sourceName}[${index}] must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const slug = asNonEmptyString(record.slug, `${sourceName}[${index}].slug`);
    const envPrefix = asNonEmptyString(record.envPrefix, `${sourceName}[${index}].envPrefix`);

    if (!slugPattern.test(slug)) {
      throw new Error(`${sourceName}[${index}].slug must use lowercase letters, numbers, and hyphens only.`);
    }

    if (!envPrefixPattern.test(envPrefix)) {
      throw new Error(`${sourceName}[${index}].envPrefix must use uppercase letters, numbers, and underscores only.`);
    }

    return {
      slug,
      envPrefix,
      title: asNonEmptyString(record.title, `${sourceName}[${index}].title`),
      assistantLabel: typeof record.assistantLabel === "string" ? record.assistantLabel.trim() : undefined,
      inputPlaceholder: typeof record.inputPlaceholder === "string" ? record.inputPlaceholder.trim() : undefined,
      initialMessage: typeof record.initialMessage === "string" ? record.initialMessage.trim() : undefined,
    };
  });
}

function resolveConfigPath() {
  const configuredPath = process.env.HANDBOOK_CONFIG_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "config", "handbooks.json"),
    path.resolve(cwd, "..", "config", "handbooks.json"),
  ];
  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!existingPath) {
    throw new Error(`Handbook configuration was not found. Checked: ${candidates.join(", ")}`);
  }

  return existingPath;
}

function loadDefinitions() {
  const environmentJson = process.env.HANDBOOK_APPS_JSON?.trim();
  if (environmentJson) {
    return parseDefinitions(environmentJson, "HANDBOOK_APPS_JSON");
  }

  const configPath = resolveConfigPath();
  return parseDefinitions(fs.readFileSync(configPath, "utf-8"), configPath);
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string, errors: string[]) {
  const value = env[name]?.trim();
  if (!value) {
    errors.push(name);
    return "";
  }

  return value;
}

function parseUsersJson(raw: string, envName: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`${envName} could not be parsed: ${detail}`);
  }

  if (!Array.isArray(value)) {
    throw new Error(`${envName} must be a JSON array.`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${envName}[${index}] must be an object.`);
    }

    const record = item as Record<string, unknown>;
    return {
      username: asNonEmptyString(record.username, `${envName}[${index}].username`),
      password: asNonEmptyString(record.password, `${envName}[${index}].password`),
    };
  });
}

function getCredentials(prefix: string, env: NodeJS.ProcessEnv, errors: string[]) {
  const jsonEnvName = `${prefix}_AUTH_USERS_JSON`;
  const usersJson = env[jsonEnvName]?.trim();

  if (usersJson) {
    const credentials = parseUsersJson(usersJson, jsonEnvName);
    if (credentials.length === 0) {
      throw new Error(`${jsonEnvName} must contain at least one credential.`);
    }
    return credentials;
  }

  const usernameName = `${prefix}_AUTH_USERNAME`;
  const passwordName = `${prefix}_AUTH_PASSWORD`;
  const username = requiredEnv(env, usernameName, errors);
  const password = requiredEnv(env, passwordName, errors);
  return username && password ? [{ username, password }] : [];
}

function buildAuthConfig(prefix: string, fallbackRealm: string, env: NodeJS.ProcessEnv, errors: string[]): AuthConfig {
  return {
    realm: env[`${prefix}_AUTH_REALM`]?.trim() || fallbackRealm,
    credentials: getCredentials(prefix, env, errors),
  };
}

function validateBaseUrl(value: string, envName: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid URL.`);
  }

  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) {
    throw new Error(`${envName} must use http or https.`);
  }

  return parsed.toString().replace(/\/$/, "");
}

export function buildHandbookRegistry(
  definitions: HandbookDefinition[],
  env: NodeJS.ProcessEnv = process.env,
): HandbookRegistry {
  const errors: string[] = [];
  const seenSlugs = new Set<string>();
  const seenPrefixes = new Set<string>();
  const adminTitle = env.ADMIN_TITLE?.trim() || "販売基本ルールAI 管理";
  const admin = {
    title: adminTitle,
    auth: buildAuthConfig("ADMIN", adminTitle, env, errors),
  };

  const apps = definitions.map((definition) => {
    if (seenSlugs.has(definition.slug)) {
      throw new Error(`Duplicate handbook slug: ${definition.slug}`);
    }
    if (seenPrefixes.has(definition.envPrefix)) {
      throw new Error(`Duplicate handbook envPrefix: ${definition.envPrefix}`);
    }
    seenSlugs.add(definition.slug);
    seenPrefixes.add(definition.envPrefix);

    const prefix = definition.envPrefix;
    const baseUrlEnvName = `${prefix}_BRAIN_BASE_URL`;
    const baseUrl = requiredEnv(env, baseUrlEnvName, errors);
    const projectId = requiredEnv(env, `${prefix}_BRAIN_PROJECT_ID`, errors);
    const apiKey = requiredEnv(env, `${prefix}_BRAIN_API_KEY`, errors);

    return {
      slug: definition.slug,
      title: definition.title,
      assistantLabel: definition.assistantLabel || definition.title,
      inputPlaceholder: definition.inputPlaceholder || `${definition.title}について質問を入力`,
      initialMessage: definition.initialMessage || `${definition.title}です。確認したいことを入力してください。`,
      connectionName: env[`${prefix}_BRAIN_CONNECTION_NAME`]?.trim() || `${definition.title} Brain`,
      brain: {
        baseUrl: baseUrl ? validateBaseUrl(baseUrl, baseUrlEnvName) : "",
        projectId,
        apiKey,
      },
      auth: buildAuthConfig(prefix, definition.title, env, errors),
    };
  });

  if (errors.length > 0) {
    throw new Error(`Required environment variables are missing: ${[...new Set(errors)].join(", ")}`);
  }

  const bySlug = new Map(apps.map((app) => [app.slug, app]));
  return {
    apps,
    admin,
    indexEnabled: isEnabled(env.HANDBOOK_INDEX_ENABLED),
    get(slug: string) {
      return bySlug.get(slug);
    },
    listPublic() {
      return apps.map(toPublicHandbookConfig);
    },
  };
}

export function loadHandbookRegistry() {
  return buildHandbookRegistry(loadDefinitions());
}

export function toPublicHandbookConfig(app: HandbookApp): PublicHandbookConfig {
  return {
    slug: app.slug,
    title: app.title,
    assistantLabel: app.assistantLabel,
    inputPlaceholder: app.inputPlaceholder,
    initialMessage: app.initialMessage,
    connectionName: app.connectionName,
  };
}
