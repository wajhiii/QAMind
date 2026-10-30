import fs from "node:fs";
import path from "node:path";
import { BEHIND_NOTE, CANNOT_SEE_ON_SCREEN, GLOSSARY, LOGIN_NOTE, hasBehindTheScreens, plainDate, TECHNICAL_FILE } from "../lib/adminreport.ts";
import type { AdminModel } from "../lib/adminreport.ts";
import { renderReports } from "../lib/reports.ts";

/** HTML export of the admin report: ONE self-contained file for emailing (spec §11.4). No external resources of any kind. */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const SEV_CLASS: Record<string, string> = { critical: "sev-critical", important: "sev-important", minor: "sev-minor" };
const SEV_LABEL: Record<string, string> = { critical: "🔴 Critical", important: "🟠 Important", minor: "🟡 Minor" };
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
export const MAX_IMAGE_BYTES = 2_500_000;
export const MAX_TOTAL_IMAGE_BYTES = 12_000_000;

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1c2330;--muted:#5b6678;--line:#d9dee7;--card:#f6f8fb;--crit:#b3261e;--imp:#a65a00;--min:#7a6a00;--ok:#1b6e3b;--link:#1a56c4}
@media (prefers-color-scheme:dark){:root{--bg:#10151c;--fg:#e6ebf2;--muted:#9aa6b8;--line:#2a3340;--card:#171e28;--crit:#ff8a80;--imp:#ffb74d;--min:#e6d36a;--ok:#7bd69b;--link:#8ab4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:20px 16px 48px}
h1,h2,h3{line-height:1.25}h2{margin-top:2rem;border-bottom:1px solid var(--line);padding-bottom:.3rem}
.verdict{font-size:1.2rem;font-weight:600;padding:14px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card)}
.verdict.not-ready{border-color:var(--crit)}.verdict.risks{border-color:var(--imp)}.verdict.ready{border-color:var(--ok)}
.summary{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 18px;margin:16px 0}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.problem{border:1px solid var(--line);border-left-width:6px;border-radius:10px;padding:4px 16px 8px;margin:16px 0;background:var(--card)}
.problem.sev-critical{border-left-color:var(--crit)}.problem.sev-important{border-left-color:var(--imp)}.problem.sev-minor{border-left-color:var(--min)}
.problem h3{margin:.7rem 0}.problem dl{margin:0}.problem dt{font-weight:600;margin-top:.6rem}.problem dd{margin:.1rem 0 0}
img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px;margin-top:6px}
.muted{color:var(--muted);font-size:.9rem}a{color:var(--link)}
@media print{body{font-size:11pt}.problem{break-inside:avoid}}
`;

export interface HtmlOptions {
  /** Return a data URI for an image path (relative to the run folder), or undefined to link it as text. */
  embed?: (rel: string) => string | undefined;
}

export function renderAdminHtml(m: AdminModel, title: string, opts: HtmlOptions = {}): string {
  const cls = m.verdict.level === "ready" ? "ready" : m.verdict.level === "ready-with-risks" ? "risks" : "not-ready";
  const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const H: string[] = [];
  H.push("<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">', `<title>${esc(title)}</title>`, `<style>${CSS}</style>`, "</head>", "<body>", "<main>");
  H.push(`<h1>${esc(title)}</h1>`, `<p class="verdict ${cls}">${bold(m.verdict.line)}</p>`);
  if (m.environment.length) H.push("<h2>The test environment has a problem</h2>", "<p>Nothing below can be trusted as a statement about the product until this is fixed:</p>", `<ul>${m.environment.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`);
  H.push('<section class="summary"><strong>30-second summary</strong>', `<ul>${m.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>`);
  H.push("<h2>What we found, by area</h2>", "<table><thead><tr><th>Area</th><th>Result</th><th>Notes</th></tr></thead><tbody>");
  for (const a of m.areas) H.push(`<tr><td>${esc(a.area)}</td><td>${a.result}</td><td>${esc(a.note)}</td></tr>`);
  H.push("</tbody></table>", '<p class="muted">✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked</p>');

  H.push("<h2>Problems found</h2>");
  if (m.problems.length === 0) H.push("<p>No problems were confirmed in what was checked.</p>");
  else {
    const notes = [...(m.problems.some((p) => p.steps.length > 0) ? [LOGIN_NOTE] : []), ...(hasBehindTheScreens(m) ? [BEHIND_NOTE] : [])];
    if (notes.length) H.push(`<p>${esc(notes.join(" "))}</p>`);
  }
  for (const p of m.problems) {
    H.push(`<article class="problem ${SEV_CLASS[p.severity]}" id="${esc(p.id)}">`, `<h3>${SEV_LABEL[p.severity]}: ${esc(p.title)}</h3>`, "<dl>");
    H.push(`<dt>Where</dt><dd>${esc(p.where)}</dd>`, `<dt>What happens</dt><dd>${esc(p.what)}</dd>`, `<dt>Who is affected</dt><dd>${esc(p.who)}</dd>`);
    H.push(p.steps.length ? `<dt>How to see it yourself</dt><dd><ol>${p.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></dd>` : `<dt>How to see it yourself</dt><dd>${esc(CANNOT_SEE_ON_SCREEN)}</dd>`);
    H.push(`<dt>What should happen</dt><dd>${esc(p.expected)}</dd>`);
    if (p.screenshot) {
      const uri = opts.embed?.(p.screenshot);
      H.push(`<dt>Screenshot</dt><dd>${uri ? `<img alt="Screenshot showing the problem: ${esc(p.title)}" src="${uri}">` : `<span class="muted">Not embedded in this file (${esc(p.screenshot)}); it is in the report folder.</span>`}</dd>`);
    } else H.push("<dt>Screenshot</dt><dd>None (this is not visible on screen).</dd>");
    H.push(`<dt>Status</dt><dd>${esc(p.status)}</dd>`, `<dt>Ticket</dt><dd>${p.ticket && /^https?:\/\//.test(p.ticket) ? `<a href="${esc(p.ticket)}">open the ticket</a>` : "none yet"}</dd>`);
    H.push(`<dt>For developers</dt><dd>${esc(p.id)} in ${esc(TECHNICAL_FILE)}</dd>`, "</dl>", "</article>");
  }
  H.push("<h2>Compared with the last check</h2>", `<ul>${m.trend.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
  H.push("<h2>What was not tested</h2>", m.notTested.length ? `<ul>${m.notTested.map((n) => `<li><strong>${esc(n.area)}</strong>: ${esc(n.reason)}</li>`).join("")}</ul>` : "<p>Everything planned was checked.</p>");
  if (m.nextSteps.length) H.push("<h2>Suggested next steps</h2>", `<ol>${m.nextSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
  H.push("<h2>Words used in this report</h2>", `<ul>${GLOSSARY.map(([w, d]) => `<li><strong>${esc(w)}</strong>: ${esc(d)}</li>`).join("")}</ul>`);
  H.push("<hr>", `<p class="muted">The full technical details, with exact steps for developers, are in ${esc(TECHNICAL_FILE)}. Before you share this report outside your team, look at the screenshots for personal information.</p>`, "</main>", "</body>", "</html>", "");
  return H.join("\n");
}

export interface ExportResult {
  file: string;
  bytes: number;
  images_embedded: number;
  images_skipped: string[];
  warning: string;
}

export function exportAdminHtml(runDir: string, store: string | undefined, opts: { embedImages?: boolean; out?: string } = {}): ExportResult {
  const { model, data } = renderReports(runDir, store);
  const embedded: string[] = [];
  const skipped: string[] = [];
  let total = 0;
  const embed = (rel: string): string | undefined => {
    if (opts.embedImages === false) return undefined;
    const abs = path.resolve(runDir, rel);
    if (!abs.startsWith(path.resolve(runDir) + path.sep) || !fs.existsSync(abs)) return void skipped.push(rel);
    const mime = MIME[path.extname(abs).toLowerCase()];
    const size = fs.statSync(abs).size;
    if (!mime || size > MAX_IMAGE_BYTES || total + size > MAX_TOTAL_IMAGE_BYTES) return void skipped.push(rel);
    total += size;
    embedded.push(rel);
    return `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`;
  };
  const html = renderAdminHtml(model, `QAMind report: ${data.meta?.environment ?? "test"} check on ${plainDate(data.meta?.started)}`, { embed });
  const file = opts.out ? path.resolve(opts.out) : path.join(runDir, "ADMIN-REPORT.html");
  fs.writeFileSync(file, html, "utf8");
  return {
    file,
    bytes: Buffer.byteLength(html),
    images_embedded: embedded.length,
    images_skipped: skipped,
    warning: embedded.length ? "Screenshots are embedded in this file and are not masked automatically. Look at them for personal information before you email it." : "",
  };
}
