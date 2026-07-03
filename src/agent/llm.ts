import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_tests",
      description:
        "Run a Javascript test file in an isolated sandbox and return stdout, stderr and exit code.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The full JS code to execute on the test file",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_review",
      description:
        "Submit the final code review verdict once you've finished testing. Call this when you are done.",
      parameters: {
        type: "object",
        properties: {
          verdict: {
            type: "string",
            enum: ["pass", "fail"],
            description: "Whether the code passes review",
          },
          summary: {
            type: "string",
            description:
              "A short explanation of what was tested and why it passed/failed",
          },
        },
        required: ["verdict", "summary"],
      },
    },
  },
];

export async function callLLM(
  messages: Groq.Chat.Completions.ChatCompletionMessageParam[],
) {
  return client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0,
  });
}
