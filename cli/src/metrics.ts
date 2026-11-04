import os from "node:os";
import { SEVERITIES } from "../../core/lib/config.ts";
import type { Severity } from "../../core/lib/config.ts";
import { ESCAPED_SOURCES, VERDICT_WORDS, addEscaped, agentPerformance, loadMetrics } from "../../core/lib/metrics.ts";
import type { EscapedSource } from "../../core/lib/metrics.ts";
import { withStoreLock } from "../../core/lib/memory/lock.ts";
import { projectScope } from "../../core/lib/memory/service.ts";
import { cmdEscapedFromSources } from "./integrations.ts";
import { emit, opts, UsageError } from "./util.ts";

/** `qamind escaped add | list` and `qamind metrics`: bugs that reached production, and how the agent is doing (spec 13.16). */

export function cmdEscaped(sub: string | undefined, rest: string[], home: string): number {
  if (sub === "areas" || sub === "import") return cmdEscapedFromSources(sub, rest, home);
  const { values } = opts(rest, { project: { type: "string" }, area: { type: "string" }, title: { type: "string" }, severity: { type: "string" }, source: { type: "string" }, ref: { type: "string" }, note: { type: "string" }, by: { type: "string" } });
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  if (sub === "list") {
    const f = loadMetrics(scope.store);
    emit({ total: f.escaped.length, escaped: f.escaped.map((e) => ({ id: e.id, severity: e.severity, area: e.area, title: e.title, source: e.source, ...(e.ref ? { ref: e.ref } : {}), recorded: e.recorded.slice(0, 10), what_the_runs_had_said: VERDICT_WORDS[e.verdict], verdict: e.verdict, ...(e.matched ? { matched: `${e.matched.area} in ${e.matched.run_id} (${e.matched.status})` } : {}) })) });
    return 0;
  }
  if (sub !== "add") throw new UsageError('escaped needs a subcommand: areas | import --file F | add --area A --title T [--severity critical|important|minor] [--source manual|sentry|ticket|other] [--ref ID] [--note TEXT] [--by NAME] | list');
  if (!values.area || !values.title) throw new UsageError("escaped add needs --area (the area of the product, in the words the reports use) and --title (what went wrong in production)");
  if (values.severity && !SEVERITIES.includes(values.severity as Severity)) throw new UsageError(`--severity must be one of ${SEVERITIES.join(", ")}`);
  if (values.source && !(ESCAPED_SOURCES as readonly string[]).includes(values.source as string)) throw new UsageError(`--source must be one of ${ESCAPED_SOURCES.join(", ")}`);
  const r = withStoreLock(scope.store, () =>
    addEscaped(scope.store, { area: values.area as string, title: values.title as string, ...(values.severity ? { severity: values.severity as Severity } : {}), ...(values.source ? { source: values.source as EscapedSource } : {}), ...(values.ref ? { ref: values.ref as string } : {}), ...(values.note ? { note: values.note as string } : {}), by: (values.by as string | undefined) ?? os.userInfo().username }, new Date()),
  );
  emit({
    id: r.bug.id,
    already_recorded: r.already,
    verdict: r.bug.verdict,
    what_the_runs_had_said: VERDICT_WORDS[r.bug.verdict],
    ...(r.bug.matched ? { matched_area: r.bug.matched.area, in_run: r.bug.matched.run_id, findings_the_run_had_that_look_related: r.bug.matched.findings ?? [] } : {}),
    ...(r.already ? {} : { risk: `The risk of "${r.bug.area}" is raised (${r.bug.severity}): the next runs look there first.` }),
  });
  return 0;
}

export function cmdMetrics(rest: string[], home: string): number {
  const { values } = opts(rest, { project: { type: "string" } });
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  emit(agentPerformance(scope.store));
  return 0;
}
