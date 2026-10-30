/**
 * The product change the learning test makes between its two runs, applied to the evaluation workspace's COPY of the demo app
 * (never the repo's): a new Help page (with its own script, like the other pages) linked from the client nav, a new GET /api/help endpoint, and the password-reset
 * endpoint dropped from the OpenAPI spec. Each edit must find its anchor, otherwise it throws rather than silently doing nothing.
 */
import fs from "node:fs";
import path from "node:path";

export const DEMO_CHANGE = {
  added_page: "/help.html (linked from the client nav)",
  added_endpoint: "GET /api/help",
  removed_endpoint: "POST /api/auth/reset-password (spec only)",
};

function replaceOnce(text: string, from: string | RegExp, to: string, where: string): string {
  const next = text.replace(from, () => to);
  if (next === text) throw new Error(`learning mutation: anchor not found in ${where}: ${String(from)}`);
  return next;
}

export function applyDemoChange(ws: string): void {
  const read = (f: string): string => fs.readFileSync(path.join(ws, f), "utf8");
  const write = (f: string, c: string): void => fs.writeFileSync(path.join(ws, f), c);

  // The new page is built like the existing ones (shared header, its own small script that signs the user in and wires Sign out),
  // so the only difference the second run should find is the intended one, not a defect the test itself introduced.
  const NAV_LINK = '  <a href="help.html">Help</a>\n  </nav>';
  let help = read("public/client/my-orders.html");
  help = replaceOnce(help, /<title>[^<]*<\/title>/, "<title>Help centre - Lumen Supplies</title>", "my-orders.html");
  help = replaceOnce(help, /<main[\s\S]*<\/main>/, "<main><h1>Help centre</h1><ul><li>How do I place an order?</li><li>How do I check an order status?</li></ul></main>", "my-orders.html");
  help = replaceOnce(help, '<script src="/my-orders.js"></script>', '<script src="/help.js"></script>', "my-orders.html");
  help = replaceOnce(help, ' aria-current="page"', "", "my-orders.html");
  help = replaceOnce(help, "</nav>", NAV_LINK.replace('<a href', '<a aria-current="page" href'), "my-orders.html");
  write("public/client/help.html", help);
  write("public/client/help.js", "(function () {\n  var user = lumen.requireRole('client');\n  if (!user) return;\n  lumen.bindSession(user);\n})();\n");
  for (const page of ["public/client/my-orders.html", "public/client/new-order.html"]) write(page, replaceOnce(read(page), "</nav>", NAV_LINK, page));

  let api = read("src/api.mjs");
  api = replaceOnce(api, "function products({ ctx }) {", "function helpArticles() {\n  return { status: 200, body: { items: [{ id: 'h-1', title: 'Placing an order' }, { id: 'h-2', title: 'Checking an order status' }] } };\n}\n\nfunction products({ ctx }) {", "api.mjs");
  api = replaceOnce(api, "  route('GET', '/api/products', {}, products),", "  route('GET', '/api/products', {}, products),\n  route('GET', '/api/help', { auth: false }, helpArticles),", "api.mjs");
  write("src/api.mjs", api);

  const spec = read("openapi.yaml");
  const start = spec.indexOf("  /auth/reset-password:");
  const end = spec.indexOf("  /me:");
  if (start < 0 || end < start) throw new Error("learning mutation: reset-password block not found in openapi.yaml");
  const helpPath = [
    "  /help:",
    "    get:",
    "      tags: [Catalog]",
    "      summary: List help articles",
    "      operationId: listHelp",
    "      security: []",
    "      responses:",
    "        '200':",
    "          description: Help article titles.",
    "          content:",
    "            application/json:",
    "              schema:",
    "                type: object",
    "                properties:",
    "                  items:",
    "                    type: array",
    "                    items:",
    "                      type: object",
    "",
  ].join("\n");
  write("openapi.yaml", replaceOnce(`${spec.slice(0, start)}${spec.slice(end)}`, "  /products:", `${helpPath}  /products:`, "openapi.yaml"));
}
