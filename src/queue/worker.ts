import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { reviews } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { runAgentLoop } from "../agent/loop.js";
import { getPRDiff, upsertReviewComment } from "../github/client.js";

const POLL_INTERVAL_MS = 3000;

async function claimNextJob() {
  // SKIP LOCKED: if another worker process already has a row locked, skip it
  // instead of waiting — critical for safe concurrent workers
  const result = await db.execute(sql`
    UPDATE reviews
    SET status = 'processing', updated_at = now()
    WHERE id = (
      SELECT id FROM reviews
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, owner, repo, pr_number AS "prNumber", status, verdict, summary, trace, created_at AS "createdAt", updated_at AS "updatedAt";
  `);
  return result.rows[0] as typeof reviews.$inferSelect | undefined;
}

async function processJob(job: typeof reviews.$inferSelect) {
  try {
    const diff = await getPRDiff(job.owner, job.repo, job.prNumber);
    const result = await runAgentLoop(
      `Review this PR diff. The sandbox has no file access — inline any function ` +
        `definitions needed for testing. Do not use require()/import for local files.\n\n${diff}`,
    );

    const body =
      `## AI Review: ${result.verdict.toUpperCase()}\n\n${result.summary}\n\n` +
      `<details><summary>Trace (${result.trace.length} steps)</summary>\n\n` +
      "```json\n" +
      JSON.stringify(result.trace, null, 2) +
      "\n```\n</details>";

    await upsertReviewComment(job.owner, job.repo, job.prNumber, body);

    await db
      .update(reviews)
      .set({
        status: "done",
        verdict: result.verdict,
        summary: result.summary,
        trace: result.trace,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, job.id));
  } catch (err) {
    console.error(`Job ${job.id} failed:`, err);
    await db
      .update(reviews)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(reviews.id, job.id));
  }
}

export async function startWorker() {
  console.log("Queue worker started, polling every", POLL_INTERVAL_MS, "ms");
  while (true) {
    const job = await claimNextJob();
    if (job) {
      console.log(`Processing review job ${job.id} for PR #${job.prNumber}`);
      await processJob(job);
    } else {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}
