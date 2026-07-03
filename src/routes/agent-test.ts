import { FastifyInstance } from "fastify";
import { runInSandbox } from "../sandbox/docker.js";
import { callLLM } from "../agent/llm.js";
import { executeTool } from "../agent/tool.js";
export async function agentTestRoute(app: FastifyInstance) {
  app.post("/agent-test", async () => {
    const messages = [
      {
        role: "developer" as const,
        content:
          "Write and run a test that checks 2 + 2 === 4 using Node's assert module.",
      },
    ];
    const response = await callLLM(messages);
    const message = response.choices[0].message;
    const toolCall = message.tool_calls?.[0];

    if (!toolCall) {
      return { note: "LLM did not call a tool", message };
    }

    const input = JSON.parse(toolCall.function.arguments);
    const result = await executeTool(toolCall.function.name, input);

    return { toolCalled: toolCall.function.name, input, result };
  });
}
