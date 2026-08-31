import { createApp } from "./app";
import { loadHandbookRegistry } from "./config/handbooks";
import { loadLocalEnvFiles } from "./services/localEnv";

loadLocalEnvFiles();

const port = Number(process.env.PORT ?? "3001");
const registry = loadHandbookRegistry();
const app = createApp(registry);

app.listen(port, () => {
  console.log(`ai-manual-toppan listening on port ${port} (${registry.apps.length} handbook app(s))`);
});

