import path from "node:path";

/**
 * Which files a fix may and may not touch (spec 9.3, knowledge/fixing-safely.md "Never touch"). Used by the safety hook while a fix
 * run is active and again by `fix_begin` and `fix_commit`, so the same rule applies whichever way a file is changed.
 * Patterns are gitignore-like: no slash matches that name at any depth; a slash anchors at the project root; `**` crosses folders.
 */
export interface Protected {
  glob: string;
  why: string;
}

export const BUILT_IN_PROTECTED: readonly Protected[] = [
  { glob: ".git", why: "git's own data" },
  { glob: ".env*", why: "credential and environment files" },
  { glob: "*.pem", why: "a key or certificate" },
  { glob: "*.key", why: "a key or certificate" },
  { glob: "*.p12", why: "a key or certificate" },
  { glob: "*.pfx", why: "a key or certificate" },
  { glob: "id_rsa*", why: "a key" },
  { glob: "id_ed25519*", why: "a key" },
  { glob: ".npmrc", why: "local package-manager settings that can hold tokens" },
  { glob: ".pypirc", why: "local package-manager settings that can hold tokens" },
  { glob: ".netrc", why: "credentials" },
  { glob: ".qa/config.md", why: "QAMind's project configuration" },
  { glob: ".qa/**/fix-state.json", why: "the fix loop's own record" },
  { glob: ".github", why: "CI and deployment configuration" },
  { glob: ".gitlab", why: "CI and deployment configuration" },
  { glob: ".gitlab-ci.yml", why: "CI and deployment configuration" },
  { glob: ".circleci", why: "CI and deployment configuration" },
  { glob: ".travis.yml", why: "CI and deployment configuration" },
  { glob: "Jenkinsfile", why: "CI and deployment configuration" },
  { glob: "azure-pipelines.yml", why: "CI and deployment configuration" },
  { glob: "bitbucket-pipelines.yml", why: "CI and deployment configuration" },
  { glob: "Dockerfile*", why: "build and deployment configuration" },
  { glob: "docker-compose*.yml", why: "build and deployment configuration" },
  { glob: "docker-compose*.yaml", why: "build and deployment configuration" },
  { glob: "*.tf", why: "infrastructure configuration" },
  { glob: "helm", why: "infrastructure configuration" },
  { glob: "k8s", why: "infrastructure configuration" },
  { glob: "kubernetes", why: "infrastructure configuration" },
  { glob: "package-lock.json", why: "a lock file (dependency versions)" },
  { glob: "npm-shrinkwrap.json", why: "a lock file (dependency versions)" },
  { glob: "yarn.lock", why: "a lock file (dependency versions)" },
  { glob: "pnpm-lock.yaml", why: "a lock file (dependency versions)" },
  { glob: "bun.lockb", why: "a lock file (dependency versions)" },
  { glob: "composer.lock", why: "a lock file (dependency versions)" },
  { glob: "Gemfile.lock", why: "a lock file (dependency versions)" },
  { glob: "poetry.lock", why: "a lock file (dependency versions)" },
  { glob: "Pipfile.lock", why: "a lock file (dependency versions)" },
  { glob: "go.sum", why: "a lock file (dependency versions)" },
  { glob: "Cargo.lock", why: "a lock file (dependency versions)" },
  { glob: "package.json", why: "a dependency manifest" },
  { glob: "composer.json", why: "a dependency manifest" },
  { glob: "requirements*.txt", why: "a dependency manifest" },
  { glob: "Pipfile", why: "a dependency manifest" },
  { glob: "pyproject.toml", why: "a dependency manifest" },
  { glob: "Gemfile", why: "a dependency manifest" },
  { glob: "go.mod", why: "a dependency manifest" },
  { glob: "Cargo.toml", why: "a dependency manifest" },
  { glob: "pom.xml", why: "a dependency manifest" },
  { glob: "build.gradle*", why: "a dependency manifest" },
  { glob: "node_modules", why: "installed or third-party code" },
  { glob: "vendor", why: "installed or third-party code" },
  { glob: "dist", why: "generated output" },
  { glob: "build", why: "generated output" },
  { glob: "coverage", why: "generated output" },
  { glob: ".next", why: "generated output" },
  { glob: ".nuxt", why: "generated output" },
  { glob: "*.min.js", why: "a minified bundle" },
  { glob: "*.min.css", why: "a minified bundle" },
  { glob: "*.map", why: "generated output" },
  { glob: "migrations", why: "database migrations (they may already have run elsewhere)" },
  { glob: "db/migrate", why: "database migrations (they may already have run elsewhere)" },
];

const escape = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/** Turn one glob into a regular expression over a forward-slash path relative to the project root (compared in lower case). */
export function globToRegExp(raw: string): RegExp {
  let g = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
  if (g.endsWith("/")) g += "**";
  const anchored = g.includes("/");
  let body = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string;
    if (c === "*" && g[i + 1] === "*") {
      const slashBefore = i > 0 && g[i - 1] === "/";
      if (g[i + 2] === "/") {
        body += "(?:.*/)?";
        i += 2;
      } else {
        // "dir/**" matches the folder's contents; a bare "**" matches anything
        if (slashBefore) body = body.replace(/\/$/, "") + "(?:/.*)?";
        else body += ".*";
        i += 1;
      }
    } else if (c === "*") body += "[^/]*";
    else if (c === "?") body += "[^/]";
    else body += escape(c);
  }
  // A pattern without a slash names a file or folder at any depth; with a slash it starts at the project root. Either may be a folder.
  return new RegExp(anchored ? `^${body}(?:/.*)?$` : `(?:^|/)${body}(?:/.*)?$`, "i");
}

/** The path relative to the project root with forward slashes, or undefined when it is outside the root. */
export function relativeToRoot(root: string, p: string, cwd: string = root): string | undefined {
  const abs = path.resolve(cwd, p);
  const rel = path.relative(path.resolve(root), abs);
  if (rel === "") return "";
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return undefined;
  return rel.split(path.sep).join("/");
}

export interface ProtectionRule {
  regex: RegExp;
  why: string;
}

export function compileRules(doNotTouch: string[] = []): ProtectionRule[] {
  return [
    ...BUILT_IN_PROTECTED.map((p) => ({ regex: globToRegExp(p.glob), why: p.why })),
    ...doNotTouch.map((g) => ({ regex: globToRegExp(g), why: `it is on the project's do-not-touch list (${g})` })),
  ];
}

/** Why a project-relative path must not be edited by a fix, or undefined when it may be. */
export function protectedReason(rel: string, rules: ProtectionRule[]): string | undefined {
  const hit = rules.find((r) => r.regex.test(rel));
  return hit ? `${rel} is protected: ${hit.why}` : undefined;
}

const TEST_DIR = /(?:^|\/)(?:tests?|__tests__|specs?|e2e)(?:\/|$)/i;
const TEST_NAME = /(?:[._-](?:test|spec)\.[a-z0-9]+$)|(?:^|\/)test[_-][^/]+\.(?:py|rb|php)$|(?:Tests?|Spec)\.(?:php|java|cs|kt|scala)$|_test\.(?:go|py|rb|exs?)$/i;

/** Does this project-relative path look like an automated test (the place a regression test belongs)? */
export function isTestPath(rel: string): boolean {
  return TEST_NAME.test(rel) || (TEST_DIR.test(rel) && /\.[a-z0-9]+$/i.test(rel));
}

/** Paths that a command may take as an argument: no shell metacharacters, no spaces, no leading dash. */
export const SAFE_REL_PATH = /^[A-Za-z0-9_@+][A-Za-z0-9_@+./-]*$/;
