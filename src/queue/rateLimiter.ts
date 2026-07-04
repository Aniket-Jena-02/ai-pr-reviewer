import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

const DAILY_LIMIT_PER_REPO = 20;

export async function isRateLimited(
  owner: string,
  repo: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM reviews
    WHERE owner = ${owner}
      AND repo = ${repo}
      AND created_at >= now() - interval '24 hours';
    `);
  const count = Number(result.rows[0]?.count ?? 0);
  return count >= DAILY_LIMIT_PER_REPO;
}
