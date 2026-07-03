import { FastifyInstance } from "fastify";
import { runInSandbox } from "../sandbox/docker.js";

export async function sandboxTestRoute(app: FastifyInstance) {
  app.post("/sandbox-test", async () => {
    const code = `console.log("hello from sandbox"); process.exit(0);`;
    const result = await runInSandbox(code);
    return result;
  });
}
