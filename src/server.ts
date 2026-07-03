import "dotenv/config";
import Fastify from "fastify";
import { sandboxTestRoute } from "./routes/sandbox-test.js";
import { agentTestRoute } from "./routes/agent-test.js";
import { reviewRoute } from "./routes/review.js";
import rawBody from "fastify-raw-body";
import { webhookRoute } from "./routes/webhook.js";
import { startWorker } from "./queue/worker.js";

const app = Fastify({ logger: true });
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  runFirst: true,
});

app.get("/health", async () => ({ status: "ok" }));
app.register(sandboxTestRoute);
app.register(agentTestRoute);
app.register(reviewRoute);
app.register(webhookRoute);

app.listen({ port: 3000 }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

startWorker();
