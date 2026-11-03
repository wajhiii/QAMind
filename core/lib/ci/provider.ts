import fs from "node:fs";

/**
 * Where a CI run is happening, from the environment the CI service sets (spec 13.2). Nothing here makes a request: it only reads variables and the event file.
 * Tokens are read from the environment by name and never printed or saved.
 */
export type CiProvider = "github" | "gitlab" | "local";

export interface CiContext {
  provider: CiProvider;
  /** `owner/name` on GitHub, the project path on GitLab. */
  repo?: string;
  /** GitLab's numeric project id (its API wants it). */
  project_id?: string;
  /** Pull request (GitHub) or merge request (GitLab) number. */
  pr?: number;
  /** The commit a status belongs to: the pull request's head, not the merge commit CI checked out. */
  sha?: string;
  /** The branch the change is going into. */
  base_ref?: string;
  head_ref?: string;
  api_url?: string;
  /** A page where the run and its artifacts can be found. */
  run_url?: string;
  /** Read from the environment; may be missing. */
  token?: string;
  /** The name of the variable the token came from (for messages). */
  token_name?: string;
}

const int = (v: string | undefined): number | undefined => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export function detectCi(env: NodeJS.ProcessEnv = process.env): CiContext {
  const forced = env["QAMIND_CI_PROVIDER"];
  if (forced === "github" || (forced === undefined && env["GITHUB_ACTIONS"] === "true")) {
    let pr: number | undefined;
    let sha: string | undefined = env["GITHUB_SHA"];
    let base: string | undefined = env["GITHUB_BASE_REF"] || undefined;
    let head: string | undefined = env["GITHUB_HEAD_REF"] || undefined;
    const eventFile = env["GITHUB_EVENT_PATH"];
    if (eventFile && fs.existsSync(eventFile)) {
      try {
        const ev = JSON.parse(fs.readFileSync(eventFile, "utf8")) as { number?: number; pull_request?: { number?: number; head?: { sha?: string; ref?: string }; base?: { ref?: string } } };
        pr = ev.pull_request?.number ?? ev.number;
        sha = ev.pull_request?.head?.sha ?? sha;
        base = ev.pull_request?.base?.ref ?? base;
        head = ev.pull_request?.head?.ref ?? head;
      } catch {
        /* an unreadable event file leaves what the plain variables say */
      }
    }
    pr = pr ?? int(/^refs\/pull\/(\d+)\//.exec(env["GITHUB_REF"] ?? "")?.[1]);
    const server = env["GITHUB_SERVER_URL"] ?? "https://github.com";
    return {
      provider: "github",
      ...(env["GITHUB_REPOSITORY"] ? { repo: env["GITHUB_REPOSITORY"] } : {}),
      ...(pr !== undefined ? { pr } : {}),
      ...(sha ? { sha } : {}),
      ...(base ? { base_ref: base } : {}),
      ...(head ? { head_ref: head } : {}),
      api_url: (env["GITHUB_API_URL"] ?? "https://api.github.com").replace(/\/+$/, ""),
      ...(env["GITHUB_REPOSITORY"] && env["GITHUB_RUN_ID"] ? { run_url: `${server}/${env["GITHUB_REPOSITORY"]}/actions/runs/${env["GITHUB_RUN_ID"]}` } : {}),
      ...(env["GITHUB_TOKEN"] ? { token: env["GITHUB_TOKEN"], token_name: "GITHUB_TOKEN" } : {}),
    };
  }
  if (forced === "gitlab" || (forced === undefined && env["GITLAB_CI"] === "true")) {
    const token = env["QAMIND_GITLAB_TOKEN"] ?? env["GITLAB_TOKEN"];
    const tokenName = env["QAMIND_GITLAB_TOKEN"] ? "QAMIND_GITLAB_TOKEN" : env["GITLAB_TOKEN"] ? "GITLAB_TOKEN" : undefined;
    const pr = int(env["CI_MERGE_REQUEST_IID"]);
    const base = env["CI_MERGE_REQUEST_TARGET_BRANCH_NAME"] || undefined;
    const head = env["CI_MERGE_REQUEST_SOURCE_BRANCH_NAME"] || env["CI_COMMIT_REF_NAME"] || undefined;
    return {
      provider: "gitlab",
      ...(env["CI_PROJECT_PATH"] ? { repo: env["CI_PROJECT_PATH"] } : {}),
      ...(env["CI_PROJECT_ID"] ? { project_id: env["CI_PROJECT_ID"] } : {}),
      ...(pr !== undefined ? { pr } : {}),
      ...(env["CI_MERGE_REQUEST_SOURCE_BRANCH_SHA"] || env["CI_COMMIT_SHA"] ? { sha: env["CI_MERGE_REQUEST_SOURCE_BRANCH_SHA"] || env["CI_COMMIT_SHA"] } : {}),
      ...(base ? { base_ref: base } : {}),
      ...(head ? { head_ref: head } : {}),
      api_url: (env["CI_API_V4_URL"] ?? "https://gitlab.com/api/v4").replace(/\/+$/, ""),
      ...(env["CI_JOB_URL"] ? { run_url: env["CI_JOB_URL"] } : {}),
      ...(token && tokenName ? { token, token_name: tokenName } : {}),
    };
  }
  return { provider: "local" };
}
