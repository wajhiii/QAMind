// Looks for credentials and personal data in what this repository publishes, so none is pushed by accident (the repository is public).
//   node scripts/scan-secrets.mjs             the files git tracks now
//   node scripts/scan-secrets.mjs --history   every version of every file in every commit, branch and tag
//   --repo DIR scans another repository; --show prints personal data (never a credential) whole, to tell a fixture from the real thing.
// Prints what it found with the value hidden (the first four characters only), and exits 1 if there is anything. Needs only Node and git.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoArg = process.argv.indexOf("--repo");
const root = repoArg > 0 ? path.resolve(process.argv[repoArg + 1] ?? ".") : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (args, opts = {}) => execFileSync("git", ["-C", root, ...args], { maxBuffer: 1 << 30, ...opts });

// Formats that only a real credential has. Placeholders and the fixtures of QAMind's own redaction tests are not shaped like these.
const PATTERNS = [
  ["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Anthropic or OpenAI key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/],
  ["Stripe key", /\b[rs]k_live_[A-Za-z0-9]{16,}/],
  ["Linear key", /\blin_api_[A-Za-z0-9]{30,}/],
  ["Sentry token", /\bsnt(?:rys|ryu)_[A-Za-z0-9+/=_-]{30,}/],
  ["JSON web token", /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["password inside an address", /:\/\/[^\s:@/'"`<>{}$]+:(?!(?:pw|pass|password|secret|token|x-oauth-basic|xxx+|\*+|REDACTED)@)[^\s:@/'"`<>{}$]{4,}@[a-z0-9.-]+/i],
  ["bearer token", /\bBearer\s+(?!\{|<|\$|token\b|xxx|your|REDACTED)[A-Za-z0-9._~+/=-]{30,}/],
  // Personal data: a home folder with a person's name in it, and an email address that is not a reserved test domain.
  ["personal home folder", /(?:\/Users\/|\/home\/|C:\\Users\\)(?!runner\b|RUNNER|proje|you\b|me\b|user\b|name\b|username\b|Shared\b|<|\$|\{|alice\b|bob\b|dev\b|owner\b|x\b|\.\.\.)[A-Za-z0-9._-]{2,}/],
  ["personal email address", /\b[A-Za-z0-9._%+-]+@(?:gmail|googlemail|yahoo|hotmail|outlook|icloud|proton|protonmail|live)\.[a-z]{2,}\b/i],
];

// A credential is never printed whole. Personal data (a home folder, an address) is, with --show, so a person can tell a fixture from a real one.
const SHOW = process.argv.includes("--show");
const PERSONAL = new Set(["personal home folder", "personal email address"]);
// Test files and the real-agent check scripts hold made-up data on purpose (a token to see it masked, an address to see it refused), and the notices list package authors.
// Credential formats and home folders are still looked for there; these kinds are not.
const MADE_UP_OK = new Set(["bearer token", "JSON web token", "personal email address"]);
const madeUp = (where) => /^(tests\/|scripts\/eval-)/.test(where) || (where.startsWith("plugins/qamind/THIRD-PARTY-NOTICES.md") || where.startsWith("THIRD-PARTY-NOTICES.md"));
const hide = (s, name) => (SHOW && PERSONAL.has(name) ? s : `${s.slice(0, 4)}… (${s.length} characters)`);
const looksBinary = (buf) => buf.subarray(0, 8000).includes(0);
const MAX_BYTES = 8 * 1024 * 1024;

function scan(text, where, found) {
  const kept = (name) => !(MADE_UP_OK.has(name) && madeUp(where));
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 20000) continue; // a bundled line: its own tokens are scanned as part of the others below
    for (const [name, re] of PATTERNS) {
      const m = kept(name) ? re.exec(line) : null;
      if (m) found.push({ name, where: `${where}:${i + 1}`, shown: hide(m[0], name) });
    }
  }
  // Bundled files have very long lines: look through those whole, once per pattern.
  for (const line of lines) {
    if (line.length <= 20000) continue;
    for (const [name, re] of PATTERNS) {
      const m = kept(name) ? re.exec(line) : null;
      if (m) found.push({ name, where: `${where} (a very long line)`, shown: hide(m[0], name) });
    }
  }
}

const found = [];
let files = 0;
const history = process.argv.includes("--history");

// The contents to look at: blob id -> the path it was seen under. The tracked files now, or every distinct content ever committed (once).
const wanted = new Map();
if (history) {
  for (const l of git(["rev-list", "--all", "--objects"]).toString("utf8").split("\n")) {
    const sp = l.indexOf(" ");
    if (sp > 0) wanted.set(l.slice(0, sp), l.slice(sp + 1));
  }
} else {
  for (const l of git(["ls-files", "-s", "-z"]).toString("utf8").split("\0").filter(Boolean)) {
    const m = /^\d+ ([0-9a-f]+) \d\t(.*)$/s.exec(l);
    if (m) wanted.set(m[1], m[2]);
  }
}
const out = spawnSync("git", ["-C", root, "cat-file", "--batch"], { input: [...wanted.keys()].join("\n") + "\n", maxBuffer: 1 << 30 }).stdout;
for (let pos = 0; pos < out.length; ) {
  const eol = out.indexOf(10, pos);
  const [id, type, size] = out.subarray(pos, eol).toString("utf8").split(" ");
  const n = Number(size);
  const body = out.subarray(eol + 1, eol + 1 + n);
  pos = eol + 1 + n + 1;
  if (type !== "blob" || n > MAX_BYTES || looksBinary(body)) continue;
  files++;
  scan(body.toString("utf8"), history ? `${wanted.get(id)} [${id.slice(0, 8)}]` : wanted.get(id), found);
}

const what = history ? "file versions in all of the history" : "tracked files";
if (found.length === 0) {
  console.log(`No credentials or personal data found in ${files} ${what}.`);
} else {
  console.log(`Found ${found.length} possible ${found.length === 1 ? "problem" : "problems"} in ${files} ${what}:`);
  for (const f of found.slice(0, 200)) console.log(`  ${f.name}: ${f.where}  ${f.shown}`);
  process.exitCode = 1;
}
