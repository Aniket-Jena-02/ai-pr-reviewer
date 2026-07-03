import { Octokit } from "octokit";

export const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function postReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
) {
  return github.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

export async function getPRDiff(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const { data } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function upsertReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
) {
  const marker = "<!-- ai-pr-reviewer -->";
  const taggedBody = `${marker}\n${body}`;

  const { data: comments } = await github.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  const existing = comments.find((c) => c.body?.includes(marker));

  if (existing) {
    return github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: taggedBody,
    });
  }

  return github.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: taggedBody,
  });
}
