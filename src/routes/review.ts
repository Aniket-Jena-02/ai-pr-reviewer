import { FastifyInstance } from "fastify";
import { runAgentLoop } from "../agent/loop.js";

export async function reviewRoute(app: FastifyInstance) {
  app.post("/review", async (req) => {
    const { task } = req.body as { task: string };
    return runAgentLoop(task);
  });
}
