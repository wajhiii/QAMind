import { screenForSecretsAndPii } from "./memory/store.ts";
import type { RunMarker } from "./run.ts";
import { looksLikeProductionName } from "./urlpolicy.ts";

/**
 * The agent's Linear and Sentry tool calls during a run (spec 11.4, 12). Both are optional and reached through whatever tool the host has connected, so the guard goes by the tool's name:
 * a tool whose name mentions the service. Reading is fine; changing anything is allowed only where the plan says (a ticket in the configured team, a comment on a ticket), in a run a
 * person started, with text that holds no secret or private data. Anything not clearly a read is treated as a change.
 */

const READ_VERB = /^(get|list|search|find|whoami|read|query|fetch|describe|analy[sz]e|extract|show|lookup)(_|$)/i;

const serviceOf = (tool: string): "linear" | "sentry" | undefined => {
  const t = tool.toLowerCase();
  if (!t.includes("__")) return undefined;
  if (t.includes("linear")) return "linear";
  if (t.includes("sentry")) return "sentry";
  return undefined;
};
const verbOf = (tool: string): string => tool.split("__").pop() ?? tool;

const CREATE_FIELDS = new Set(["team", "title", "description", "priority", "labels", "project", "relatedTo"]);

const text = (v: unknown): string => (typeof v === "string" ? v : "");

function mentionsProduction(ti: Record<string, unknown>): string | undefined {
  for (const [k, v] of Object.entries(ti)) {
    if (/environment/i.test(k)) {
      for (const e of Array.isArray(v) ? v : [v]) if (typeof e === "string" && looksLikeProductionName(e.trim())) return e;
    }
    if (typeof v === "string") {
      const m = /environment(?:s)?\s*(?:[:=]|in|is)\s*\(?\[?\s*["']?([A-Za-z0-9_.-]+)/i.exec(v);
      if (m && looksLikeProductionName(m[1] as string)) return m[1];
    }
  }
  return undefined;
}

/** A reason to refuse the call, or undefined when it may go ahead. */
export function trackerToolDecision(marker: Pick<RunMarker, "trigger" | "integrations">, tool: string, ti: Record<string, unknown>): string | undefined {
  const service = serviceOf(tool);
  if (!service) return undefined;
  const verb = verbOf(tool);
  const reads = READ_VERB.test(verb);

  if (service === "sentry") {
    if (!reads) return `${tool} could change something in Sentry. A QA run only reads Sentry (the errors of the test system during the run); it never resolves, assigns, mutes or configures anything there.`;
    if (!marker.integrations?.sentry) return "Sentry is not set up for this project (there is no integrations.sentry in .qa/config.md), so a run does not read it. Ask the owner to add the Sentry project and the test environments.";
    const prod = mentionsProduction(ti);
    if (prod) return `A run reads the errors of the test system only (${marker.integrations.sentry.environments.join(", ")}), not "${prod}". Production errors are for the owner's escaped-bug check (/qa-memory-review escaped), outside a run.`;
    return undefined;
  }

  // Linear
  if (reads) return undefined;
  if (verb !== "save_issue" && verb !== "save_comment") return `${tool} is not something a QA run does in Linear. A run may create an issue (save_issue) or comment on one (save_comment), nothing else: it never edits, closes, moves, assigns, deletes or reorganises.`;
  if (marker.trigger !== "manual") return "Tickets are made only in a run a person started: nobody is there to be asked in a CI or automatic run. Record why with `tracker skip`.";
  const linear = marker.integrations?.linear;
  if (!linear) return "Linear is not set up for this project (there is no integrations.linear in .qa/config.md), so a run does not write to it.";
  const body = verb === "save_issue" ? `${text(ti["title"])}\n${text(ti["description"])}` : text(ti["body"]);
  const problems = screenForSecretsAndPii(body);
  if (problems.length) return `The text for Linear ${problems[0]}. Use the text from \`tracker plan\` (it is masked), or mask it with \`privacy mask\`: nothing private goes to a tracker.`;

  if (verb === "save_comment") {
    if (ti["id"] || ti["parentId"]) return "A run adds a new comment to a ticket; it does not edit or reply inside another thread.";
    const parents = ["issueId", "projectId", "initiativeId", "documentId", "milestoneId", "statusUpdateId"].filter((k) => ti[k]);
    if (parents.length !== 1 || parents[0] !== "issueId") return "A run comments on a ticket (issueId) only: not on a project, initiative, document or update.";
    return undefined;
  }
  if (ti["id"]) return "A run creates tickets and comments on them; it does not edit one that exists (that includes its description, state, labels and assignee). Use save_comment for the update.";
  const extra = Object.keys(ti).filter((k) => !CREATE_FIELDS.has(k) && ti[k] !== undefined && ti[k] !== null);
  if (extra.length) return `A new ticket is made from the plan's fields only (${[...CREATE_FIELDS].join(", ")}); not ${extra.join(", ")}.`;
  if (text(ti["team"]).trim().toLowerCase() !== linear.team.toLowerCase()) return `Tickets go in the configured team (${linear.team}), not "${text(ti["team"])}".`;
  if (ti["project"] && linear.project && text(ti["project"]).toLowerCase() !== linear.project.toLowerCase()) return `Tickets go in the configured project (${linear.project}), not "${text(ti["project"])}".`;
  return undefined;
}
