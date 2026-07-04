import { FastifyInstance } from "fastify";
import { verify } from "@octokit/webhooks-methods";
import { runAgentLoop } from "../agent/loop.js";
import {
  getPRDiff,
  postReviewComment,
  upsertReviewComment,
} from "../github/client.js";
import { db } from "../db/index.js";
import { reviews } from "../db/schema.js";
import { isRateLimited } from "../queue/rateLimiter.js";

export async function webhookRoute(app: FastifyInstance) {
  app.post(
    "/webhook/github",
    { config: { rawBody: true } }, // needed to verify signature against raw bytes
    async (req, reply) => {
      const signature = req.headers["x-hub-signature-256"] as string;
      const rawBody = (req as any).rawBody as string;

      const isValid = await verify(
        process.env.GITHUB_WEBHOOK_SECRET!,
        rawBody,
        signature,
      );
      if (!isValid) {
        return reply.status(401).send({ error: "Invalid signature" });
      }

      const event = req.headers["x-github-event"];
      const payload = req.body as any;

      if (
        event === "pull_request" &&
        (payload.action === "opened" || payload.action === "synchronize")
      ) {
        const { owner, repo, prNumber } = {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          prNumber: payload.pull_request.number,
        };

        const limited = await isRateLimited(owner, repo);
        if (limited) {
          return reply.status(429).send({ status: "rate_limited" });
        }

        await db
          .insert(reviews)
          .values({ owner, repo, prNumber, status: "pending" });

        return reply.status(200).send({ status: "queued" });
      }

      return reply.status(200).send({ status: "ignored" });
    },
  );
}

async function runReviewAsync(owner: string, repo: string, prNumber: number) {
  try {
    const diff = await getPRDiff(owner, repo, prNumber);
    const result = await runAgentLoop(
      `Review this PR diff and write/run tests to validate correctness:\n\n${diff}`,
    );

    const body =
      `## AI Review: ${result.verdict.toUpperCase()}\n\n` +
      `${result.summary}\n\n` +
      `<details><summary>Trace (${result.trace.length} steps)</summary>\n\n` +
      "```json\n" +
      JSON.stringify(result.trace, null, 2) +
      "\n```\n</details>";

    // this is used to post a new review comment everytime
    // await postReviewComment(owner, repo, prNumber, body);
    // while this updates the initial commit
    await upsertReviewComment(owner, repo, prNumber, body);
  } catch (err) {
    console.error("Review failed:", err);
  }
}
