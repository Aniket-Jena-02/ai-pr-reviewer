import { runInSandbox } from "../sandbox/docker.js";

export async function executeTool(name: string, input: any) {
  switch (name) {
    case "run_tests":
      return runInSandbox(input.code);
    case "submit_review":
      return input;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
