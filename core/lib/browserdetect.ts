import fs from "node:fs";
import path from "node:path";

/** A Chrome or Edge installed on this machine, if any (the test browser prefers it over downloading one). */
export function detectChromeChannel(): "chrome" | "msedge" | undefined {
  const exists = (p: string) => fs.existsSync(p);
  const onPath = (name: string) => (process.env["PATH"] ?? "").split(path.delimiter).some((d) => d && exists(path.join(d, name)));
  if (process.platform === "darwin") {
    if (exists("/Applications/Google Chrome.app")) return "chrome";
    if (exists("/Applications/Microsoft Edge.app")) return "msedge";
  } else if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env["LOCALAPPDATA"]].filter((x): x is string => !!x);
    if (roots.some((r) => exists(path.join(r, "Google", "Chrome", "Application", "chrome.exe")))) return "chrome";
    if (roots.some((r) => exists(path.join(r, "Microsoft", "Edge", "Application", "msedge.exe")))) return "msedge";
  } else {
    if (["google-chrome", "google-chrome-stable"].some(onPath)) return "chrome";
    if (onPath("microsoft-edge")) return "msedge";
  }
  return undefined;
}
