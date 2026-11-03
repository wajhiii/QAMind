import type { RunScope } from "../memory/service.ts";
import { contextFrom } from "../privacy.ts";
import { runApiPerf } from "./api.ts";
import type { ApiPerfContext, ApiPerfResults } from "./api.ts";

export function apiPerfContextForRun(scope: RunScope): ApiPerfContext {
  const ctx = scope.ctx;
  return {
    store: scope.store,
    runDir: scope.runDir,
    runId: scope.runId,
    config: ctx.config,
    policy: ctx.policy,
    roles: ctx.roles,
    passwords: ctx.passwords,
    privacy: contextFrom(ctx.config, ctx.roles.map((r) => r.username)),
    ...(ctx.marker.budget?.deadline ? { deadlineMs: Date.parse(ctx.marker.budget.deadline) } : {}),
  };
}

export async function runApiPerfForRun(scope: RunScope): Promise<ApiPerfResults> {
  return runApiPerf(apiPerfContextForRun(scope));
}
