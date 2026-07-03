import Groq from "groq-sdk";
import { callLLM } from "./llm.js";
import { executeTool } from "./tool.js";

const MAX_ITERATIONS = 6;

export interface AgentResult {
  verdict: "pass" | "fail" | "incomplete";
  summary: string;
  trace: Array<{ tool: string; input: any; output: any }>;
}

export async function runAgentLoop(diffOrTask: string): Promise<AgentResult> {
  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a code review agent. You will be given a diff or coding task. " +
        "IMPORTANT: The sandbox has NO access to any files from the repository — " +
        "it only runs the exact code string you provide, with no file system access, " +
        "no node_modules, and no require()/import of local files. " +
        "You MUST copy the relevant function definitions directly into your test code " +
        "as inline declarations, then test them in the same script. " +
        "Write tests using Node's assert module, run them with run_tests, and iterate " +
        "if they fail. " +
        "CRITICAL: You must NEVER respond with plain text. Every single response you give " +
        "must be a tool call — either run_tests or submit_review. Once you have enough " +
        "information to give a verdict, you MUST call submit_review as a tool call, " +
        "not as a text message. Do not explain your reasoning in plain text; put your " +
        "explanation in the submit_review 'summary' parameter instead.",
    },
    { role: "user", content: diffOrTask },
  ];

  const trace: AgentResult["trace"] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await callLLM(messages);
    const message = response.choices[0].message;
    const toolCall = message.tool_calls?.[0];

    if (!toolCall) {
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content:
          "You responded with plain text instead of a tool call. " +
          "You MUST call submit_review now with your verdict and summary as a tool call.",
      });
      continue; // give it one more iteration to self-correct
    }

    const input = JSON.parse(toolCall.function.arguments);
    const output = await executeTool(toolCall.function.name, input);
    trace.push({ tool: toolCall.function.name, input, output });

    if (toolCall.function.name === "submit_review") {
      return { verdict: input.verdict, summary: input.summary, trace };
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    });
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(output),
    });
  }

  return {
    verdict: "incomplete",
    summary: `Hit max iterations (${MAX_ITERATIONS}) without a final verdict.`,
    trace,
  };
}
