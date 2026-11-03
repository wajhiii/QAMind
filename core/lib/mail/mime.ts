/** A small MIME reader for catchers that hand over the raw message (MailHog, custom APIs): headers, quoted-printable and base64 bodies, multipart parts. */

export interface MimeResult {
  headers: Record<string, string[]>;
  text: string;
  html: string;
}

function decodeBytes(bytes: Buffer, charset: string | undefined): string {
  try {
    return new TextDecoder(charset && /^[\w-]+$/.test(charset) ? charset : "utf-8").decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

export function decodeQuotedPrintable(s: string): Buffer {
  const joined = s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i] as string;
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      out.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(...Buffer.from(c, "utf8"));
  }
  return Buffer.from(out);
}

/** RFC 2047 words in a header (`=?UTF-8?B?...?=`), decoded. */
export function decodeHeaderWords(v: string): string {
  return v.replace(/=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, body: string) => {
    try {
      const bytes = enc.toUpperCase() === "B" ? Buffer.from(body, "base64") : decodeQuotedPrintable(body.replace(/_/g, " "));
      return decodeBytes(bytes, cs);
    } catch {
      return body;
    }
  });
}

export function parseHeaders(block: string): Record<string, string[]> {
  const headers: Record<string, string[]> = {};
  let current: string | undefined;
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) {
      const list = headers[current] as string[];
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }
    const i = line.indexOf(":");
    if (i <= 0) continue;
    current = line.slice(0, i).trim().toLowerCase();
    (headers[current] ??= []).push(line.slice(i + 1).trim());
  }
  return headers;
}

function bodyOf(raw: string, headers: Record<string, string[]>): string {
  const enc = (headers["content-transfer-encoding"]?.[0] ?? "").toLowerCase();
  const charset = /charset="?([\w-]+)"?/i.exec(headers["content-type"]?.[0] ?? "")?.[1];
  if (enc === "base64") return decodeBytes(Buffer.from(raw.replace(/\s+/g, ""), "base64"), charset);
  if (enc === "quoted-printable") return decodeBytes(decodeQuotedPrintable(raw), charset);
  return raw;
}

export function parseMime(raw: string, depth = 0): MimeResult {
  const split = /\r?\n\r?\n/.exec(raw);
  const head = split ? raw.slice(0, split.index) : raw;
  const body = split ? raw.slice(split.index + split[0].length) : "";
  const headers = parseHeaders(head);
  const type = (headers["content-type"]?.[0] ?? "text/plain").toLowerCase();
  const out: MimeResult = { headers, text: "", html: "" };
  const boundary = /boundary="?([^";\s]+)"?/i.exec(headers["content-type"]?.[0] ?? "")?.[1];
  if (type.startsWith("multipart/") && boundary && depth < 4) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith("--")) break;
      // the line break before the next boundary belongs to the boundary, not to the part
      const sub = parseMime(part.replace(/^\r?\n/, "").replace(/\r?\n$/, ""), depth + 1);
      if (sub.text && !out.text) out.text = sub.text;
      if (sub.html && !out.html) out.html = sub.html;
    }
    return out;
  }
  const decoded = bodyOf(body, headers);
  if (type.startsWith("text/html")) out.html = decoded;
  else if (type.startsWith("text/")) out.text = decoded;
  return out;
}

/** The visible text of an HTML body: tags and scripts removed, entities for the common characters decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
