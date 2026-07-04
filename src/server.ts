import "dotenv/config";
import Fastify from "fastify";
import { sandboxTestRoute } from "./routes/sandbox-test.js";
import { agentTestRoute } from "./routes/agent-test.js";
import { reviewRoute } from "./routes/review.js";
import rawBody from "fastify-raw-body";
import { webhookRoute } from "./routes/webhook.js";
import { startWorker } from "./queue/worker.js";
import { dashboardRoute } from "./routes/dashboard.js";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const app = Fastify({ logger: true });
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  runFirst: true,
});

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), "public"),
  prefix: "/dashboard-assets/",
});

app.get("/health", async () => ({ status: "ok" }));
app.get("/dashboard", async (req, reply) => {
  return reply.sendFile("dashboard.html");
});
app.register(sandboxTestRoute);
app.register(agentTestRoute);
app.register(reviewRoute);
app.register(webhookRoute);
app.register(dashboardRoute);

app.listen({ port: 3000 }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

startWorker();
