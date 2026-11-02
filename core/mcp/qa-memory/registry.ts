import { FIX_TOOLS } from "./fixtools.ts";
import { TOOLS as MEMORY_TOOLS } from "./tools.ts";
import type { ToolDef } from "./common.ts";

/** Every tool the qa-memory server offers: memory and run bookkeeping, then the fix loop. */
export const ALL_TOOLS: ToolDef[] = [...MEMORY_TOOLS, ...FIX_TOOLS];
