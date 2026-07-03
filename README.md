# AI PR Reviewer

An autonomous code review agent that listens for GitHub pull requests, writes and runs tests against the changed code in an isolated sandbox, and posts a verdict back as a PR comment — with no human in the loop.

Built to explore agentic tool-calling patterns (LLM-driven test-and-iterate loops) combined with safe execution of untrusted code, using a fully async, queue-backed architecture.

## What it does

1. A GitHub webhook fires when a PR is opened or updated.
2. The event is queued in Postgres — the webhook responds immediately, so slow LLM/Docker work never blocks GitHub's webhook timeout.
3. A background worker claims the job (`FOR UPDATE SKIP LOCKED`) and fetches the PR diff.
4. An LLM agent (Groq, tool-calling loop) writes test code for the changed functions, runs it in a sandboxed Docker container, reads the result, and iterates — up to a bounded number of steps — until it reaches a verdict.
5. The verdict and reasoning are posted back to the PR as a comment (updated in place on subsequent pushes, not duplicated).

## Architecture

```
GitHub PR event
      │
      ▼
 Webhook (Fastify) ── signature verified (HMAC) ── inserts job, returns 200 immediately
      │
      ▼
 Postgres queue (reviews table)
      │
      ▼
 Worker (SKIP LOCKED polling loop)
      │
      ├── fetch PR diff (GitHub REST API)
      │
      ▼
 Agent loop (Groq tool-calling)
      │
      ├── run_tests  ──▶ Docker sandbox (isolated, no network, memory-capped)
      ├── (iterate on failure, bounded by MAX_ITERATIONS)
      └── submit_review ──▶ verdict + summary
      │
      ▼
 GitHub PR comment (created or updated)
```

## Why these design choices

**Postgres as a job queue, not Redis/BullMQ.**
Reviews are infrequent, don't need sub-second latency, and Postgres was already in the stack. `SELECT ... FOR UPDATE SKIP LOCKED` gives atomic job claiming across multiple worker instances without an extra service to run — a well-known lightweight alternative to a dedicated message broker.

**Sandboxed execution for all LLM-generated code.**
The agent runs code it wrote itself against untrusted input. Docker containers are spun up per test run with no network access, a memory cap, and no host filesystem access, then torn down. This was a deliberate security boundary, not an afterthought.

**A bounded agent loop, not an open-ended one.**
LLM agents that loop without a cap are a known failure mode — cost blowups, infinite retries on a model that can't converge. The loop here has a hard iteration ceiling and falls back to an explicit `incomplete` state rather than hanging.

**Retry logic for LLM unreliability, not just application errors.**
Two real failure modes surfaced during development and both are handled explicitly:
- The model occasionally emits malformed tool-call syntax — retried automatically.
- The model occasionally answers in plain text instead of calling the `submit_review` tool, even after reaching a correct conclusion — the loop detects this and re-prompts it to express the same answer as a proper tool call, rather than silently losing a correct verdict.

**Async queue over synchronous webhook handling.**
The first working version ran the full agent loop inside the webhook handler. This caused GitHub to retry slow requests, risking duplicate reviews. Moving to a queue was a direct fix for a real bug encountered during testing, not a preemptive optimization.

## Stack

- **Runtime:** Node.js, TypeScript
- **API:** Fastify
- **LLM:** Groq (tool-calling agent loop)
- **Sandbox:** Docker (via `dockerode`)
- **Queue/DB:** PostgreSQL + Drizzle ORM (`SKIP LOCKED` pattern)
- **GitHub integration:** Octokit, HMAC-verified webhooks

## Example output

On a PR introducing two logic bugs (an inverted discount calculation and inverted even/odd check), the agent:

1. Inlined the changed functions into a self-contained test script (no access to repo files by design — a real sandbox constraint it has to reason around)
2. Wrote assertions against expected behavior
3. Ran them in the sandbox, observed both assertions fail with the actual vs. expected values
4. Posted:

> **AI Review: FAIL**
> Implemented tests for `calculateDiscount` and `isEven`... Both tests failed, confirming the PR introduces incorrect logic.
>
> <details><summary>Trace (2 steps)</summary>
> run_tests → assertion failures with exact values → submit_review
> </details>

## Running locally

```bash
# start Postgres
docker compose up -d

# install deps
npm install

# run migrations
npm run db:generate
npm run db:migrate

# start server + worker
npm run dev

# forward GitHub webhook events to localhost
cloudflared tunnel --url http://localhost:3000
# then set the printed https://*.trycloudflare.com/webhook/github URL
# as the webhook Payload URL in your GitHub repo settings
```

Requires a `.env` with `DATABASE_URL`, `GROQ_API_KEY`, `GITHUB_TOKEN` (classic PAT, `repo` scope), and `GITHUB_WEBHOOK_SECRET`. See `.env.example`.

## Known limitations / next steps

- Currently tests single-file diffs; multi-file PRs would need the agent to reason across several inlined modules.
- No cost/rate guard yet on LLM calls per repo per day — worth adding before pointing this at a busy repo.
- Sandbox currently supports JS/Node test execution only.
