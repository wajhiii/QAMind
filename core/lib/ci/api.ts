import type { CiSettings } from "../config.ts";
import { COMMENT_MARKER } from "./comment.ts";
import type { CiContext } from "./provider.ts";

/**
 * The little of GitHub's and GitLab's APIs that `qamind ci` uses: keep one comment on the pull request up to date, and set a commit status. Nothing else is read or written.
 * `fetch` can be replaced (tests run against a local server); the token is only ever sent in the Authorization header and never appears in a message.
 */
export class CiApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface CommentResult {
  action: "created" | "updated";
  id: string;
  url?: string;
}

export type StatusState = "success" | "failure" | "error" | "pending";

export interface CiApi {
  upsertComment(body: string): Promise<CommentResult>;
  setStatus(state: StatusState, description: string, targetUrl?: string): Promise<void>;
}

type Fetch = typeof fetch;

async function call(f: Fetch, method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; json: unknown }> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await f(url, { method, headers: { accept: "application/json", "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      if (res.status >= 500 && attempt === 0) {
        last = new CiApiError(`HTTP ${res.status}`, res.status);
        continue; // one more try for a server hiccup
      }
      return { status: res.status, json };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof CiApiError ? last : new CiApiError(`could not reach the API (${(last as Error)?.message ?? "no answer"})`, 0);
}

const hint = (status: number, what: string, need: string): string => (status === 401 || status === 403 ? `${what} was refused (HTTP ${status}): ${need}` : `${what} failed (HTTP ${status})`);

function github(ctx: CiContext, f: Fetch, context: string): CiApi {
  const base = ctx.api_url as string;
  const auth = { authorization: `Bearer ${ctx.token}`, "x-github-api-version": "2022-11-28" };
  const repo = ctx.repo as string;
  return {
    async upsertComment(body) {
      // The comment is ours when it carries the marker and a bot wrote it (anyone can paste the marker; only a bot's comment is updated).
      let found: { id: number; html_url?: string } | undefined;
      for (let page = 1; page <= 30 && !found; page++) {
        const r = await call(f, "GET", `${base}/repos/${repo}/issues/${ctx.pr}/comments?per_page=100&page=${page}`, auth);
        if (r.status !== 200 || !Array.isArray(r.json)) throw new CiApiError(hint(r.status, "Reading the pull request's comments", "the job needs `pull-requests: write` (and `issues: write` on some setups)"), r.status);
        found = (r.json as Array<{ id: number; body?: string; html_url?: string; user?: { type?: string } }>).find((c) => (c.body ?? "").includes(COMMENT_MARKER) && c.user?.type === "Bot");
        if ((r.json as unknown[]).length < 100) break;
      }
      if (found) {
        const u = await call(f, "PATCH", `${base}/repos/${repo}/issues/comments/${found.id}`, auth, { body });
        if (u.status === 200) return { action: "updated", id: String(found.id), ...(found.html_url ? { url: found.html_url } : {}) };
        if (u.status !== 403 && u.status !== 404) throw new CiApiError(hint(u.status, "Updating the comment", "the job needs `pull-requests: write`"), u.status);
        // not ours to edit after all: write a new one below
      }
      const c = await call(f, "POST", `${base}/repos/${repo}/issues/${ctx.pr}/comments`, auth, { body });
      if (c.status !== 201) throw new CiApiError(hint(c.status, "Posting the comment", "the job needs `pull-requests: write`; pull requests from forks get a read-only token"), c.status);
      const made = c.json as { id?: number; html_url?: string };
      return { action: "created", id: String(made.id ?? ""), ...(made.html_url ? { url: made.html_url } : {}) };
    },
    async setStatus(state, description, targetUrl) {
      const r = await call(f, "POST", `${base}/repos/${repo}/statuses/${ctx.sha}`, auth, { state, context, description: description.slice(0, 140), ...(targetUrl ? { target_url: targetUrl } : {}) });
      if (r.status !== 201) throw new CiApiError(hint(r.status, "Setting the commit status", "the job needs `statuses: write`"), r.status);
    },
  };
}

function gitlab(ctx: CiContext, f: Fetch, context: string): CiApi {
  const base = ctx.api_url as string;
  const auth = { "private-token": ctx.token as string };
  const project = encodeURIComponent(ctx.project_id ?? ctx.repo ?? "");
  return {
    async upsertComment(body) {
      let found: { id: number } | undefined;
      for (let page = 1; page <= 30 && !found; page++) {
        const r = await call(f, "GET", `${base}/projects/${project}/merge_requests/${ctx.pr}/notes?per_page=100&page=${page}&sort=asc`, auth);
        if (r.status !== 200 || !Array.isArray(r.json)) throw new CiApiError(hint(r.status, "Reading the merge request's notes", "QAMIND_GITLAB_TOKEN needs the `api` scope and a role that can comment"), r.status);
        found = (r.json as Array<{ id: number; body?: string; system?: boolean }>).find((n) => !n.system && (n.body ?? "").includes(COMMENT_MARKER));
        if ((r.json as unknown[]).length < 100) break;
      }
      if (found) {
        const u = await call(f, "PUT", `${base}/projects/${project}/merge_requests/${ctx.pr}/notes/${found.id}`, auth, { body });
        if (u.status === 200) return { action: "updated", id: String(found.id) };
        if (u.status !== 403 && u.status !== 404) throw new CiApiError(hint(u.status, "Updating the note", "QAMIND_GITLAB_TOKEN needs the `api` scope"), u.status);
      }
      const c = await call(f, "POST", `${base}/projects/${project}/merge_requests/${ctx.pr}/notes`, auth, { body });
      if (c.status !== 201) throw new CiApiError(hint(c.status, "Posting the note", "QAMIND_GITLAB_TOKEN needs the `api` scope"), c.status);
      return { action: "created", id: String((c.json as { id?: number })?.id ?? "") };
    },
    async setStatus(state, description, targetUrl) {
      const mapped = state === "failure" || state === "error" ? "failed" : state;
      const r = await call(f, "POST", `${base}/projects/${project}/statuses/${ctx.sha}`, auth, { state: mapped, name: context, description: description.slice(0, 140), ...(targetUrl ? { target_url: targetUrl } : {}) });
      if (r.status !== 201) throw new CiApiError(hint(r.status, "Setting the commit status", "QAMIND_GITLAB_TOKEN needs the `api` scope"), r.status);
    },
  };
}

/** What can be done here: a comment needs a pull request and a token, a status needs a commit and a token. Anything missing says why. */
export function apiFor(ctx: CiContext, settings: Pick<CiSettings, "status_context">, f: Fetch = fetch): { api?: CiApi; canComment: boolean; canStatus: boolean; why: string[] } {
  const why: string[] = [];
  if (ctx.provider === "local") return { canComment: false, canStatus: false, why: ["not running in GitHub Actions or GitLab CI, so nothing is posted (the comment is written to a file)"] };
  if (!ctx.token) why.push(`no token: set ${ctx.provider === "github" ? "GITHUB_TOKEN (env: GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }})" : "QAMIND_GITLAB_TOKEN (a masked variable holding an access token with the api scope)"} so QAMind can post`);
  if (!ctx.repo && !ctx.project_id) why.push("the repository is not known");
  if (ctx.pr === undefined) why.push("this run is not for a pull request, so there is no comment to keep");
  if (!ctx.sha) why.push("the commit is not known, so no status is set");
  const ready = !!ctx.token && !!(ctx.repo || ctx.project_id);
  const api: CiApi = ctx.provider === "github" ? github(ctx, f, settings.status_context) : gitlab(ctx, f, settings.status_context);
  return { ...(ready ? { api } : {}), canComment: ready && ctx.pr !== undefined, canStatus: ready && !!ctx.sha, why };
}
