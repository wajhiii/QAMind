// QAMind page masking (spec 13.8). The browser launcher puts the project's settings in front of this file and injects it into every page, BEFORE the page's own scripts run:
//   - elements matching `privacy.mask_selectors` are blurred;
//   - email addresses, phone numbers, national ID numbers and card numbers that appear as text, and in form fields, are wrapped and blurred (a test account's own data and the
//     addresses reserved for tests stay readable), as are matches of `privacy.mask_patterns`.
// It blurs in the page, so a screenshot taken afterwards never shows the data: nothing is edited afterwards. The same patterns are in core/lib/privacy.ts (a test keeps the two in step).
(() => {
  const CFG = (typeof globalThis !== "undefined" && globalThis.__QAMIND_MASK_CONFIG) || { selectors: [], patterns: [], prefix: "QA-", allow: [] };
  const PREFIX = String(CFG.prefix || "").toLowerCase();
  const ALLOW = (CFG.allow || []).map((a) => String(a).toLowerCase());
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
  const RESERVED_HOST = /(?:^|\.)(?:example\.(?:com|org|net)|[\w-]+\.(?:test|invalid|localhost|example)|test|invalid|localhost|example)$/i;
  const CNIC = /(?<!\d)\d{5}-\d{7}-\d(?!\d)/g;
  const PHONE = /(?<![\w.])(?:\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}|\(?\d{3}\)?[ -]\d{3}[ -]\d{4}|0\d{3}[ -]?\d{7})(?![\w])/g;
  const CARD = /(?<!\d)(?<!\d\.)(?:[3-6]\d{3}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}|[3-6]\d{12,18})(?!\d)(?!\.\d)/g;
  const FICTION_PHONE = /555[ -]?01\d\d/;
  const custom = [];
  for (const p of CFG.patterns || []) {
    try {
      custom.push(new RegExp(p, "gu"));
    } catch (e) {
      /* the config check refuses an invalid pattern; a page must never break over one */
    }
  }

  const luhn = (digits) => {
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = Number(digits[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  };

  function findPii(text) {
    const hits = [];
    for (const m of text.matchAll(EMAIL)) {
      const lower = m[0].toLowerCase();
      const host = lower.slice(lower.lastIndexOf("@") + 1);
      if (!(RESERVED_HOST.test(host) || ALLOW.includes(lower) || (PREFIX && lower.startsWith(PREFIX)))) hits.push({ kind: "email address", start: m.index, end: m.index + m[0].length });
    }
    for (const m of text.matchAll(CNIC)) hits.push({ kind: "national ID number", start: m.index, end: m.index + m[0].length });
    for (const m of text.matchAll(CARD)) {
      const d = m[0].replace(/\D/g, "");
      if (d.length >= 13 && d.length <= 19 && luhn(d)) hits.push({ kind: "card number", start: m.index, end: m.index + m[0].length });
    }
    for (const m of text.matchAll(PHONE)) {
      if (!FICTION_PHONE.test(m[0]) && m[0].replace(/\D/g, "").length >= 9 && !(PREFIX && text.slice(Math.max(0, m.index - PREFIX.length), m.index).toLowerCase() === PREFIX)) hits.push({ kind: "phone number", start: m.index, end: m.index + m[0].length });
    }
    for (const re of custom) for (const m of text.matchAll(re)) if (m[0] !== "") hits.push({ kind: "custom pattern", start: m.index, end: m.index + m[0].length });
    hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const out = [];
    for (const h of hits) if (out.length === 0 || h.start >= out[out.length - 1].end) out.push(h);
    return out;
  }

  if (typeof document === "undefined") {
    // Not in a page (the tests load this file in plain Node): only the pure part is offered.
    globalThis.__qamindMask = { findPii };
    return;
  }
  if (window.__qamindMaskNow) return;

  const MARK = "data-qamind-mask";
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TITLE", "HEAD", "OPTION"]);
  // An init script runs before the page has any elements: the style sheet goes in as soon as there is a document element to put it in.
  const style = document.createElement("style");
  style.setAttribute("data-qamind", "mask");
  style.textContent = `${[...(CFG.selectors || []), `[${MARK}]`].join(",")}{filter:blur(8px)!important}`;
  const attach = () => (document.head || document.documentElement).appendChild(style);
  if (document.documentElement) attach();
  else {
    const waiting = new MutationObserver(() => {
      if (document.documentElement) {
        waiting.disconnect();
        attach();
      }
    });
    waiting.observe(document, { childList: true });
  }

  let wrapped = 0;
  function maskTextIn(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 11 && root.nodeType !== 3)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    if (root.nodeType === 3) nodes.push(root);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || parent.closest(`[${MARK}]`)) continue;
      const text = node.nodeValue || "";
      if (text.length < 6) continue;
      const hits = findPii(text);
      if (hits.length === 0) continue;
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const h of hits) {
        if (h.start > at) frag.appendChild(document.createTextNode(text.slice(at, h.start)));
        const span = document.createElement("span");
        span.setAttribute(MARK, h.kind);
        span.textContent = text.slice(h.start, h.end);
        frag.appendChild(span);
        at = h.end;
        wrapped++;
      }
      if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  function maskFields(root) {
    const scope = root && root.querySelectorAll ? root : document;
    for (const el of scope.querySelectorAll("input, textarea")) {
      if (el.type === "password" || el.type === "hidden") continue;
      const hits = findPii(String(el.value || ""));
      if (hits.length > 0 && !el.hasAttribute(MARK)) {
        el.setAttribute(MARK, hits[0].kind);
        wrapped++;
      }
    }
  }

  function run(root) {
    maskTextIn(root || document.body);
    maskFields(root && root.nodeType === 1 ? root : document);
  }

  window.__qamindMaskNow = () => {
    run(document.body);
    return wrapped;
  };
  const start = () => {
    run(document.body);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") maskTextIn(r.target);
        for (const n of r.addedNodes) if (!(n.nodeType === 1 && n.hasAttribute(MARK))) run(n);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener("input", (e) => e.target && maskFields(e.target.parentElement || document), true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
