/**
 * Per-prompt tags (spec 9.5), read from the prompt as the user typed it. They apply to that task only. Case-insensitive, anywhere in the prompt,
 * and only as a whole word: `#qa` is not found in `#qalpha`, `#qa-full` is not `#qa`, and `page#qa` or a link ending in `/#qa` is not a tag.
 */
export type ForceTag = "qa" | "qa-full" | "qa-fix";

export interface PromptTags {
  noqa: boolean;
  /** The strongest forcing tag (fix over full over plain), if any. */
  force?: ForceTag;
}

const TAG = /(?<![\w/.#-])#(noqa|qa-full|qa-fix|qa)(?![\w-])/gi;
const STRENGTH: Record<ForceTag, number> = { qa: 1, "qa-full": 2, "qa-fix": 3 };

export function parseTags(prompt: string): PromptTags {
  let noqa = false;
  let force: ForceTag | undefined;
  for (const m of prompt.matchAll(TAG)) {
    const tag = (m[1] as string).toLowerCase();
    if (tag === "noqa") noqa = true;
    else if (!force || STRENGTH[tag as ForceTag] > STRENGTH[force]) force = tag as ForceTag;
  }
  return { noqa, ...(force ? { force } : {}) };
}

/**
 * Is this prompt itself a QAMind QA command (`/qamind:qa-only`, `/qamind:qa`, `/qamind-qa-only` on hosts without namespaces, or the short `/qa-only`, `/qa`)? Such a task is a QA run: auto-QA
 * never starts another one after it (spec 9.5 rule 4). The toggle `/qa-auto` and the other QAMind skills are not QA runs.
 */
/**
 * The gate's own block message begins with this. A host that submits it back as the next prompt (Cursor submits `followup_message` as the next user message) would otherwise
 * look like a new task to the prompt hook.
 */
export const CONTINUATION_PREFIX = "QAMind auto-QA.";
export const isContinuation = (prompt: string): boolean => prompt.trimStart().startsWith(CONTINUATION_PREFIX);

export function isQaCommand(prompt: string): boolean {
  return /^\s*\/(?:qamind[:-])?qa(?:-only)?(?=\s|$)/i.test(prompt);
}
