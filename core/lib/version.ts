declare const __QAMIND_VERSION__: string | undefined;
declare const __QAMIND_KNOWLEDGE_VERSION__: string | undefined;

/** Injected by the build; "dev" when running from source. Recorded in every report (spec §13.17). */
export const QAMIND_VERSION: string = typeof __QAMIND_VERSION__ !== "undefined" ? __QAMIND_VERSION__ : "dev";
export const KNOWLEDGE_VERSION: string = typeof __QAMIND_KNOWLEDGE_VERSION__ !== "undefined" ? __QAMIND_KNOWLEDGE_VERSION__ : "dev";
