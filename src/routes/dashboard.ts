import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { reviews } from "../db/schema.js";
import { desc, sql } from "drizzle-orm";

const statusColor: Record<string, string> = {
  pending: "text-status-pending border-status-pending/40",
  processing: "text-status-processing border-status-processing/40",
  done: "text-status-done border-status-done/40",
  failed: "text-status-failed border-status-failed/40",
};

const verdictColor: Record<string, string> = {
  pass: "text-status-done",
  fail: "text-status-failed",
  incomplete: "text-board-muted",
};

function statusTile(status: string, id: number) {
  const cls = statusColor[status] ?? "text-board-muted border-board-border";
  const dot =
    status === "processing"
      ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-status-processing animate-pulse mr-1.5"></span>`
      : "";
  return `<span id="tile-status-${id}" class="flap-tile inline-flex items-center px-2 py-1 rounded border ${cls} bg-board-bg text-xs font-mono uppercase tracking-wide">${dot}${status}</span>`;
}

function verdictLabel(verdict: string | null, id: number) {
  if (!verdict)
    return `<span id="tile-verdict-${id}" class="text-board-muted font-mono text-xs">—</span>`;
  const cls = verdictColor[verdict] ?? "text-board-muted";
  return `<span id="tile-verdict-${id}" class="font-mono text-xs font-semibold uppercase ${cls}">${verdict}</span>`;
}

export async function dashboardRoute(app: FastifyInstance) {
  app.get("/dashboard/rows", async (req, reply) => {
    const rows = await db
      .select()
      .from(reviews)
      .orderBy(desc(reviews.createdAt))
      .limit(20);

    const [{ pending, processing, today }] = (
      await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS today
        FROM reviews;
      `)
    ).rows as any[];

    reply.type("text/html");

    const statsOob = `
    <div id="stats-strip" hx-swap-oob="true" class="flex flex-wrap gap-3 mt-5">
      <span class="px-3 py-1.5 rounded bg-board-surface border border-board-border text-xs font-mono text-board-muted">
        PENDING <span id="stat-pending" class="stat-count text-board-amber">${pending}</span>
      </span>
      <span class="px-3 py-1.5 rounded bg-board-surface border border-board-border text-xs font-mono text-board-muted">
        RUNNING <span id="stat-processing" class="stat-count text-status-processing">${processing}</span>
      </span>
      <span class="px-3 py-1.5 rounded bg-board-surface border border-board-border text-xs font-mono text-board-muted">
        TODAY <span id="stat-today" class="stat-count text-board-text">${today}</span>
      </span>
    </div>`;

    if (rows.length === 0) {
      reply.send(`${statsOob}
<div class="p-8 text-center">
  <p class="text-board-text font-mono text-sm">No reviews yet.</p>
  <p class="text-board-muted font-mono text-xs mt-1">Open a pull request on a connected repo to see it appear here.</p>
</div>`);
      return;
    }

    const tableRows = rows
      .map(
        (r) => `
      <tr class="border-t border-board-border">
        <td class="px-4 py-3 font-mono text-sm">${r.owner}/${r.repo}</td>
        <td class="px-4 py-3 font-mono text-sm text-board-muted">#${r.prNumber}</td>
        <td class="px-4 py-3">${statusTile(r.status, r.id)}</td>
        <td class="px-4 py-3">${verdictLabel(r.verdict, r.id)}</td>
        <td class="px-4 py-3 font-mono text-xs text-board-muted">${new Date(r.createdAt).toLocaleTimeString()}</td>
      </tr>`,
      )
      .join("");

    const cards = rows
      .map(
        (r) => `
      <div class="border-t border-board-border p-4 flex flex-col gap-2">
        <div class="flex justify-between items-start">
          <span class="font-mono text-sm">${r.owner}/${r.repo} <span class="text-board-muted">#${r.prNumber}</span></span>
          <span class="font-mono text-xs text-board-muted">${new Date(r.createdAt).toLocaleTimeString()}</span>
        </div>
        <div class="flex gap-2 items-center">
          ${statusTile(r.status)}
          ${verdictLabel(r.verdict)}
        </div>
      </div>`,
      )
      .join("");

    reply.send(`${statsOob}
<div class="hidden md:block">
  <table class="w-full">
    <thead>
      <tr class="text-left text-board-muted text-xs font-mono uppercase">
        <th class="px-4 py-3">Repo</th>
        <th class="px-4 py-3">PR</th>
        <th class="px-4 py-3">Status</th>
        <th class="px-4 py-3">Verdict</th>
        <th class="px-4 py-3">Time</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>
<div class="md:hidden">${cards}</div>`);
  });
}
