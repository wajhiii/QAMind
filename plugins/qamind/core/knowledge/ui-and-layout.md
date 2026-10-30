# Visual and layout testing

Load this when testing how pages look and behave at different screen sizes and states: responsive layout, overflow,
overlap, truncation, loading and error states, formatting consistency, wording, navigation and slow pages. The page audit
finds leads for several of these (sideways scroll, off-screen controls, covered elements, clipped text, broken images);
this file tells you what else to look at and how to turn an oddity into a finding you can prove.

## Viewports to try
- Always: desktop 1366x768 and mobile 390x844. Add the others when something looks odd or in a full pass:
  320 (smallest supported width; the reflow limit), 360 (common Android), 414 (large phone), 480 (where phone layouts often
  break), 768 (tablet portrait), 1024 (tablet landscape, small laptop), 1920 (wide: stretched lines, huge gaps, content that
  should be capped).
- Breakpoint bugs sit just beside the breakpoint. When a layout changes at some width, test a few pixels each side (for
  example 767 and 768) as well as the round numbers. Binary-search the width where a problem starts and report that width.
- Resize then reload at least once at 320 and 390: some layouts are decided by script at load, others on resize. A
  layout that is right after reload but wrong after resizing (or the reverse) is a finding.
- Also try a short viewport (for example 390x500 or a landscape phone 844x390): tall dialogs and fixed bars fail here.
- Record the viewport on every finding. Run the page audit at each viewport you use.

## Checks

### Overflow and unreachable controls
- Page scrolls sideways (`pageScrollsSideways`): at 320 to 480 px the page itself should only scroll vertically. Find the
  widest element (see the procedure below). Typical culprits: a fixed width or `min-width`, a wide table with no wrapper,
  a long unbroken string, an image without `max-width: 100%`, a flex child that cannot shrink, a negative margin.
- Controls pushed off-screen (`controlsOffscreen`): a primary button, a menu or a form field that sits outside the viewport
  and cannot be reached by scrolling is a blocker for that viewport. Also check the right end of toolbars and the last
  column of tables where row actions live.
- Content that is cut off with no way to scroll to it (`overflow: hidden` on a parent, a fixed height) is worse than content
  that scrolls. Try scrolling inside the box, and with the keyboard.
- A table that scrolls inside its own container is normal on small screens, and a horizontal page scroll is not. Check
  the table is wrapped (the container scrolls, the page does not), there is some cue that more columns exist (cut-off column
  edge, shadow, a hint), the key identifying column and the row actions are reachable, and the header stays aligned with the
  cells. Stacked "card" layouts for tables must keep a label for every value. Compare row counts and values with the wide
  layout; hidden columns must not hide required information (status, total, id).
- Dropdowns, date pickers, tooltips and menus opened near the right or bottom edge must stay inside the viewport or
  flip. Open them from the last row of a table and from the last field of a form. A menu clipped by an ancestor with
  `overflow: hidden`, or a list that extends below the viewport with no scroll, is a defect.
- Modals and drawers: taller than the viewport must scroll inside, with the close and primary buttons reachable at 390x500.
  Check the page behind does not scroll while the dialog is open, and that the dialog is not cut at the sides at 320.
- Z-index and stacking: dropdowns appearing under a sticky header, toasts behind a modal, a modal behind a cookie bar, a
  tooltip hidden under the next row. The audit's `coveredElements` sees some of this; confirm with `document.elementFromPoint`
  at the control's centre.

### Overlap, covered content and fixed or sticky elements
- Sticky or fixed headers covering content: click an in-page anchor or skip link, press Tab through a long form, and open a
  hash URL. The target and focused control must not end up hidden under the header (`scroll-margin-top` or
  `scroll-padding-top` fixes this). Check at mobile, where the header is a larger share of the screen.
- Fixed bottom bars (cookie notices, chat widgets, "add to cart" bars, install prompts) covering the last row, a submit button
  or a pagination control. Scroll to the very end of every long page and check the last element is fully visible and
  clickable.
- Viewport-height tricks (`100vh`) can place content behind browser toolbars on phones; look at bottom-aligned buttons
  and full-height panels at 390x844.
- Overlapping text and controls after a longer label, a translation, a long name or a validation message pushes
  neighbours; look at headers, cards, badges, toolbars, and form rows with error text.

### Text: clipping, wrapping, truncation, long values
- Clipped text (`clippedText`): text cut by a fixed height or `overflow: hidden`, descenders cut off, buttons whose
  label is clipped, a heading hidden under the next block.
- Ellipsis may hide essential information. Anything the user must read in full (reference numbers, ids, amounts, status,
  names that differ only at the end, file names with extensions) must not be truncated without a way to see all of it
  (tooltip, expand, detail page, copy). The unique part of an id is often at the end; truncating the end hides it.
- Long words and long names: enter a 60 to 100 character name with no spaces, a long email, a long URL, a long id, and a
  very long multi-word name. Look at lists, tables, cards, headers, breadcrumbs, toasts and dropdown options. The layout must
  wrap, truncate gracefully with access to the full value, or scroll inside the box, and never push the page wider or
  overlap neighbours. Flex and grid children need `min-width: 0` (or an overflow rule) to be allowed to shrink.
- Very long lists of data (hundreds of rows, long option lists) must paginate, scroll or virtualize without freezing.
- Short values: a single character, an empty string rendered as an empty box, a lone "0".
- Numbers in narrow columns (large amounts, many digits): they must not wrap into two lines or be cut off.
- Line length and spacing on 1920: paragraphs stretching across the full width are hard to read; unusual but only minor.

### Touch and pointer
- At 390 px, tap targets should be comfortably large (24x24 CSS px is the WCAG 2.2 minimum, about 44 px is friendly) and
  not crowded; row actions, icon buttons, pagination and chips are the usual offenders (see `accessibility.md`).
- Hover-only features (menus, tooltips, row actions shown on hover) need a touch and keyboard alternative.

### States: empty, loading, error, partial
- Empty state: a list, search and dashboard with no data shows a clear message and the next step, not a blank area or a
  header with no rows. Use a QA- account or a filter that matches nothing.
- Loading: skeletons and spinners must end. Wait 10 to 15 seconds and look at the network list. A spinner that never ends
  because a request failed, or one that spins while the data is already loaded, is a defect. A page that takes several seconds
  and shows only a spinner, with no progress, timeout, error message or retry, is a finding even when it eventually loads
  (record the measured time).
- Error: when a request returns an error (visible in the network list), the UI must say so in plain language and offer
  a way forward; no blank page, no raw JSON, no stack trace. Check the console for the underlying error.
- Partial data: a field that is null or missing in the response should render as blank or a dash, never "undefined",
  "null", "NaN", "[object Object]", "Invalid Date" or a raw `{{placeholder}}` or translation key. Search the page text
  with `evaluate` for these tokens.
- Layout shift: content that jumps as images, fonts, banners or late data load, so that a button moves under the cursor, is
  a usability defect. Good vitals practice is a cumulative shift under 0.1 (poor above 0.25). Take screenshots a second apart,
  look at images without dimensions, and late-injected banners pushing content down. Chromium-based browsers expose
  layout-shift entries for measurement. Shifts that follow a user's own click are not counted against the page.
- Broken images (`brokenImages`): confirm in the network list whether it is a 404, a blocked host (environment, check the
  guard log) or a bad URL. Missing alt text is a separate accessibility lead.
- Fonts failing: a request for a font file that fails, text that stays invisible, or icons showing as empty squares or
  odd letters (an icon font that did not load). Check `[...document.fonts].filter(f => f.status === "error")`.
- Dark mode, only if the product offers it: switch it with the product's own control and look for invisible text, dark
  text on dark panels, images with transparent backgrounds, form controls left light, and low-contrast borders.
- Print styles, only if the product has printable pages (invoices, receipts, reports): confirm navigation is hidden and
  nothing is cut off. Skip otherwise.
- Zoom: narrowing the viewport is the practical stand-in for zoom (1280 at 400% equals 320). Text enlarged to 200% must not
  overlap or hide controls.
- Scroll position: Back from a detail page returns to the same place in the list; opening a new page starts at the top
  (a page that opens halfway down is a bug); closing a modal does not jump the page; changing filters or pages scrolls to
  the results sensibly.

### Consistency, wording and formatting
- Dates, times, numbers and currency should look the same everywhere for the same kind of value: list, detail, form,
  export, email and API. Compare at least three screens. Defects: `12/03/2026` in one place and `Mar 12, 2026` in another,
  or an ambiguous day/month order, amounts with a different number of decimals, a currency symbol before in one place and
  after in another, thousands separators that differ, negative numbers shown differently, a time with no zone label.
- Check that a date-only value does not move a day because of time zones, and that amounts have the same total on every
  screen (recompute by hand).
- Wording: the same thing has the same name everywhere ("Orders" vs "Purchases"), button labels match their outcome,
  capitalisation is consistent, plural forms are right ("1 items"), no placeholder text ("lorem ipsum", "TODO", "test"), no
  typos in headings, buttons, errors and emails. Group trivial wording issues into one minor finding.
- Status and enum values show readable labels, not raw codes (`PENDING_REVIEW`, `0`, `true`).
- Currency and units shown with the value. Units that differ between input and display.

### Navigation and links
- Every menu item leads where its label says. The current page is indicated in the menu (`aria-current` or a clear
  style). Breadcrumbs show the real path and each crumb works. The logo goes home.
- Dead links: collect internal `href` values with `evaluate` (read-only) and open a sample, especially footer links, links in
  empty states, and links inside emails or help text. Treat `#`, `javascript:void(0)`, and 404s as defects. Do not follow
  links to other sites.
- Back, Forward and Refresh: state in the URL (filters, page, tab) survives refresh and sharing; Back from a modal or step
  returns sensibly; refresh in the middle of a form does not lose a saved record or duplicate one.
- Console and network after each key action: errors and failed requests are leads even when the UI looks fine.

### Browser differences to suspect
You usually test one engine, so treat these as risks and report them as findings only when you observe them or see them in
the source; otherwise list "other browsers" under Not tested.
- WebKit and Safari: date strings that are not ISO 8601 (a space between date and time, `dd/mm/yyyy`) have been parsed
  differently or rejected; look for `new Date(userString)`. Native date, time and number input behaviour differs; some
  CSS features arrive later; viewport units and sticky behaviour on phones differ.
- Firefox: different default form control styling and date input UI, and its own handling of some newer CSS and
  scrolling features; a layout built and checked only in a Chromium browser can differ in small ways.
- Chromium-only APIs (file system access, some clipboard, share, and layout-shift measurement) need a feature check
  and fallback. Look for features used without a check.
- Look at the source for `-webkit-` only properties and `:has()`, container queries or `dvh` used with no fallback.

## From visual oddity to a verified finding
1. Reproduce it: reload, repeat at the same viewport, then once more (a finding needs two reproductions).
2. Measure, do not eyeball. With `evaluate` collect: the element's description (tag, id, class, visible text), its
   `getBoundingClientRect()`, `scrollWidth` versus `clientWidth`, computed `overflow`, `position`, `z-index`, `width`, and
   for covering problems `document.elementFromPoint(x, y)` at the control's centre.
3. Find the width at which it begins by resizing in steps. Check the neighbouring widths and the other role if the page is
   role-specific.
4. Judge the impact: can a user still finish the task? Is information hidden or only crowded? Does a cue exist (a scroll
   shadow, a tooltip, an expand control)?
5. Save evidence: a screenshot of the region (full viewport if the problem is page-wide) and, when relevant, the console and
   network text. Name files by short slug.
6. Write the finding with the page and menu path, the viewport, numbered steps, expected and actual with numbers ("page is 612 px
   wide in a 390 px viewport; the table at `table.orders` is 600 px wide with no wrapper"), and a suspected cause.
7. Group repeated leads with one root cause (one component on many pages) into a single finding.

Helper to find what makes the page too wide (read-only; ignore items inside a deliberate scroll box):
```js
() => { const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll("body *")]
    .map((e) => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width > 0 && r.right > vw + 1)
    .sort((a, b) => b[1].right - a[1].right).slice(0, 8)
    .map(([e, r]) => ({ el: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.getAttribute("class") || "").split(" ")[0],
      right: Math.round(r.right), width: Math.round(r.width), text: (e.innerText || "").slice(0, 30) })); }
```

## Severity hints
- **critical**: a primary control (submit, pay, next, save) unreachable or covered at a common phone width; money, ids or
  quantities truncated or formatted so users act on the wrong value; a spinner that never ends on a core page; a modal that
  cannot be closed or scrolled.
- **important**: page scrolls sideways on mobile with usable controls; table content cut off with no cue; dropdown clipped;
  error shows as a blank page or endless spinner on a secondary page; inconsistent date or currency formats that could
  mislead; sticky header hides focused or anchor content; very slow page with no feedback.
- **minor**: cosmetic overlap, awkward wrapping, wording and typo issues, inconsistent capitalisation, layout shift without a
  harmful effect, dark-mode contrast glitches.

## Safe on staging
- Resizing, scrolling and reading are safe. Wait for slow pages once; do not hammer a slow endpoint to measure it, and
  do not load-test. A single measured time and the network entry are enough evidence.
- Use QA- data for long-name and special-character tests, and clean up only what you created. Long names and unusual text
  go through the normal forms, never by editing someone else's records.
- Screenshots of real people's data should be avoided or described generically; save only the region you need.
- If you change a product setting such as dark mode or language, change it back.

## Common bug patterns
- Fixed widths and `min-width` on containers; `white-space: nowrap` on long text; flex or grid children that cannot shrink.
- Tables without a scroll wrapper; `overflow: hidden` on a parent that also holds dropdowns (use a portal or a different
  overflow strategy).
- Sticky elements with no `scroll-padding`; `position: fixed` bars with no bottom padding on the page.
- `z-index` fights between stacking contexts (a parent with `transform` or `opacity` traps its children).
- Images without width, height or `aspect-ratio`; late-injected banners; web fonts without a fallback or size match.
- Hard-coded locale or format strings; dates built from strings; truncation by character count in script.
- Loading flags that are never reset in a `finally` branch; missing handling for failed requests.

## See also
`accessibility.md`, `i18n-and-rtl.md`, `forms.md`, `search-filter-pagination.md`, `bug-reporting.md`
