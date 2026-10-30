// QAMind page audit. The browser launcher injects this file into every page, so an agent can run it with:
//   browser_evaluate  ->  () => window.__qamindAudit()
// It only READS the page. It reports leads (things worth a human look), not verdicts: judge each against the product.
(() => {
  if (window.__qamindAudit) return;
  const CAP = 12;
  const clean = (s, n = 50) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const describe = (el) => {
    if (!el || !el.tagName) return "?";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => "." + c).join("") : "";
    const extra = el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : "";
    const t = clean(el.innerText || el.value || el.getAttribute("placeholder") || "", 30);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}${extra}${t ? ` "${t}"` : ""}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const accessibleName = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || "").join(" ").trim();
      if (t) return t;
    }
    if (el.labels && el.labels.length) {
      const t = Array.from(el.labels).map((l) => l.textContent).join(" ").trim();
      if (t) return t;
    }
    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();
    if (el.tagName === "INPUT" && ["button", "submit", "reset"].includes(el.type)) return el.value || "";
    if (el.tagName === "IMG") return el.getAttribute("alt") || "";
    // Form fields get their name from a label, never from their own content (a select's options are not its name).
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return "";
    const text = (el.textContent || "").trim();
    if (text) return text;
    const img = el.querySelector("img[alt]");
    if (img && img.alt.trim()) return img.alt.trim();
    const svgTitle = el.querySelector("svg title");
    return svgTitle ? svgTitle.textContent.trim() : "";
  };
  const scrollBoxOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (["auto", "scroll"].includes(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return p;
    }
    return null;
  };
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch (e) {
      return fallback;
    }
  };

  window.__qamindAudit = () => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const out = { url: location.href, title: document.title, viewport: { width: vw, height: vh }, lang: document.documentElement.lang || null, dir: document.documentElement.dir || null };
    const interactive = Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=textbox], [role=combobox]")).filter(visible);

    out.unnamedControls = safe(() => interactive.filter((el) => !accessibleName(el)).slice(0, CAP).map((el) => ({ element: describe(el), note: el.tagName === "INPUT" && el.placeholder ? "has a placeholder but no label (placeholders are not labels)" : undefined })), []);
    out.imagesMissingAlt = safe(() => Array.from(document.images).filter((i) => visible(i) && !i.hasAttribute("alt")).slice(0, CAP).map(describe), []);
    out.brokenImages = safe(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).slice(0, CAP).map((i) => i.currentSrc), []);

    out.pageScrollsSideways = safe(() => {
      const sw = document.documentElement.scrollWidth;
      return sw > vw + 1 ? { scrollWidth: sw, viewportWidth: vw, overflowBy: sw - vw } : false;
    }, false);

    const offscreen = [];
    const inScrollBox = [];
    safe(() => {
      for (const el of interactive) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          const box = scrollBoxOf(el);
          (box ? inScrollBox : offscreen).push(box ? `${describe(el)} (inside a sideways-scrolling ${describe(box)})` : { element: describe(el), left: Math.round(r.left), right: Math.round(r.right), viewportWidth: vw });
        }
      }
    }, null);
    out.controlsOffscreen = offscreen.slice(0, CAP);
    out.controlsInsideScrollBoxes = { note: "Wide tables or lists that scroll inside their own box are usually fine; check there is a cue that more is available.", items: inScrollBox.slice(0, CAP) };

    out.coveredElements = safe(() => {
      const found = [];
      const targets = [...interactive, ...Array.from(document.querySelectorAll("tbody tr, h1, h2, [role=row]")).filter(visible).slice(0, 6)];
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh - 80 || r.width < 4 || r.height < 4) continue;
        const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
        const ys = [r.top + 3, r.top + r.height / 2, r.bottom - 3].filter((y) => y > 0 && y < vh - 80);
        const covering = ys.map((y) => document.elementFromPoint(x, y)).find((top) => top && top !== el && !el.contains(top) && !top.contains(el));
        if (covering) found.push({ element: describe(el), coveredBy: describe(covering) });
        if (found.length >= CAP) break;
      }
      return found;
    }, []);

    out.clippedText = safe(
      () =>
        Array.from(document.querySelectorAll("body *"))
          .filter((el) => {
            if (!visible(el) || !(el.innerText || "").trim() || el.clientWidth <= 2 || el.clientHeight <= 2) return false; // 1px boxes are visually-hidden text, not clipping
            const cs = getComputedStyle(el);
            return el.scrollWidth > el.clientWidth + 1 && (["hidden", "clip"].includes(cs.overflowX) || cs.textOverflow === "ellipsis") && el.children.length < 3;
          })
          .slice(0, CAP)
          .map((el) => `${describe(el)} (text is ${el.scrollWidth}px wide in a ${el.clientWidth}px box)`),
      [],
    );

    out.rtlTextInLtrContainer = safe(() => {
      const hits = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length > 0 || !visible(el)) continue;
        const t = el.textContent || "";
        const letters = t.replace(/[^\p{L}]/gu, "");
        const rtl = (letters.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) || []).length;
        if (letters.length > 0 && rtl / letters.length > 0.5) {
          const cs = getComputedStyle(el);
          if (cs.direction === "ltr") hits.push({ element: describe(el), direction: cs.direction, textAlign: cs.textAlign, text: clean(t, 30) });
        }
        if (hits.length >= CAP) break;
      }
      return hits;
    }, []);

    out.headings = safe(() => {
      const levels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(visible).map((h) => Number(h.tagName[1]));
      const skips = [];
      levels.forEach((l, i) => i > 0 && l - levels[i - 1] > 1 && skips.push(`h${levels[i - 1]} then h${l}`));
      return { h1Count: levels.filter((l) => l === 1).length, skippedLevels: skips.slice(0, CAP) };
    }, {});

    const countable = ["unnamedControls", "imagesMissingAlt", "brokenImages", "controlsOffscreen", "coveredElements", "clippedText", "rtlTextInLtrContainer"];
    out.leadCount = countable.reduce((n, k) => n + (out[k] || []).length, 0) + (out.pageScrollsSideways ? 1 : 0) + ((out.headings && out.headings.skippedLevels) || []).length;
    return out;
  };
})();
