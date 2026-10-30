import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { repoRoot } from "./helpers.ts";

const knowledge = path.join(repoRoot, "core", "knowledge");

function topicFiles(dir = knowledge, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...topicFiles(path.join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.name.endsWith(".md") && e.name !== "INDEX.md") out.push(`${prefix}${e.name}`);
  }
  return out.sort();
}

const files = topicFiles();
const read = (rel: string) => fs.readFileSync(path.join(knowledge, rel), "utf8");

// What the spec's suggested file list calls for (§8.2).
const REQUIRED = [
  "test-design.md", "exploratory-charters.md", "forms.md", "auth-and-sessions.md", "permissions-and-data-isolation.md", "api-testing.md",
  "security-checks.md", "accessibility.md", "ui-and-layout.md", "i18n-and-rtl.md", "payments-and-money.md", "file-uploads.md",
  "search-filter-pagination.md", "notifications-email.md", "bug-reporting.md", "debugging-and-root-cause.md", "fixing-safely.md", "flaky-tests.md",
  ...["react", "nextjs", "vue", "laravel", "django", "rails", "express", "dotnet"].map((f) => `framework-notes/${f}.md`),
];

test("every file the spec asks for exists", () => {
  for (const f of REQUIRED) assert.ok(files.includes(f), `missing knowledge file: ${f}`);
});

test("each file is one focused, checklist-style topic under 300 lines", () => {
  for (const f of files) {
    const text = read(f);
    const lines = text.split("\n").length;
    assert.ok(lines < 300, `${f} has ${lines} lines (limit 300)`);
    assert.ok(lines >= 40, `${f} has only ${lines} lines: too thin to be useful`);
    assert.match(text, /^# .+/, `${f} must start with a title`);
    assert.ok((text.match(/^## /gm) ?? []).length >= 3, `${f} needs at least three sections`);
    assert.ok((text.match(/^\s*[-*] /gm) ?? []).length >= 15, `${f} should be bullet/checklist oriented`);
    // Mentions inside `code` or "quotes" are fine (example strings to search for); a bare marker means unfinished text.
    assert.doesNotMatch(text.replace(/`[^`]*`/g, "").replace(/"[^"\n]*"/g, ""), /\b(TODO|FIXME|lorem ipsum|TBD)\b/i, `${f} contains an unfinished marker`);
  }
});

test("knowledge is generic and host-agnostic: no host names, no demo-app details, no leftover brief text", () => {
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /\b(Claude|Codex|Anthropic|OpenAI)\b|\bCursor (IDE|editor|AI|rules|agent)\b/, `${f} names an AI tool`);
    assert.doesNotMatch(text, /demo-app|Lumen Supplies|SEEDED-BUGS|\bDB-\d{2}\b|@acme\.test|@zain\.test|@lumen\.test/, `${f} refers to the demo app`);
    assert.doesNotMatch(text, /knowledge-brief|scratchpad|sources-[a-z]+\.json/, `${f} leaks working notes`);
  }
});

test("references to other knowledge files point at files that exist", () => {
  const allowed = new Set(["config.md", "README.md", "TECHNICAL-REPORT.md", "ADMIN-REPORT.md", "suggested-improvements.md", "SKILL.md", "INDEX.md"]);
  const known = new Set([...files, ...files.map((f) => path.basename(f))]);
  for (const f of files) {
    for (const m of read(f).matchAll(/`((?:[a-z0-9-]+\/)?[a-z0-9-]+\.md)`/g)) {
      const ref = m[1] as string;
      if (allowed.has(ref)) continue;
      assert.ok(known.has(ref), `${f} refers to \`${ref}\`, which does not exist`);
    }
  }
});

test("INDEX.md lists every file, every link works, and it stays short enough to load cheaply", () => {
  const index = fs.readFileSync(path.join(knowledge, "INDEX.md"), "utf8");
  assert.ok(index.split("\n").length < 140, "INDEX.md should stay short");
  const linked = new Set([...index.matchAll(/\]\(([^)]+\.md)\)|`((?:framework-notes\/)?[a-z0-9-]+\.md)`/g)].map((m) => (m[1] ?? m[2]) as string));
  for (const f of files) assert.ok(linked.has(f) || [...linked].some((l) => l.endsWith(`/${f}`) || l === f), `INDEX.md does not mention ${f}`);
  for (const l of linked) assert.ok(files.includes(l) || l === "INDEX.md", `INDEX.md points at missing ${l}`);
});

test("every file is credited in docs/KNOWLEDGE-SOURCES.md with URL, licence and access date", () => {
  const sources = fs.readFileSync(path.join(repoRoot, "docs", "KNOWLEDGE-SOURCES.md"), "utf8");
  for (const f of files) assert.ok(sources.includes(f), `docs/KNOWLEDGE-SOURCES.md never mentions ${f}`);
  assert.match(sources, /gstack/i);
  assert.match(sources, /MIT/);
  const entries = sources.split(/^### /m).slice(1);
  assert.ok(entries.length >= 20, `only ${entries.length} sourced entries`);
  for (const e of entries) {
    assert.match(e, /https?:\/\//, `source entry without a URL: ${e.split("\n")[0]}`);
    assert.match(e, /Licen[cs]e:/i, `source entry without a licence: ${e.split("\n")[0]}`);
    assert.match(e, /Accessed:\s*2026-\d\d-\d\d/, `source entry without an access date: ${e.split("\n")[0]}`);
  }
});

test("a knowledge version is recorded", () => {
  assert.match(fs.readFileSync(path.join(knowledge, "VERSION"), "utf8").trim(), /^\d+\.\d+\.\d+$/);
});
