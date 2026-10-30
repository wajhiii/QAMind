# Accessibility checks (WCAG 2.2, level A and AA first)

Load this when testing any page, form, dialog or menu, or when the page audit reports unnamed controls, missing alt text
or heading skips. It lists what can be verified in a browser and says where a human-style manual pass is still needed.
Automated rules catch only part of the problems (typically contrast, missing names, bad ARIA); the rest needs the keyboard
and your eyes. Success criteria are written as number plus name, for example 2.4.7 Focus Visible. Level AAA is out of scope
unless a rule is cheap to check.

## What the page audit already covers, and what it does not
- Covered as leads: `unnamedControls` (inputs, selects, buttons, links without a name; 1.1.1, 4.1.2, 3.3.2), `imagesMissingAlt`
  (an `img` with no `alt` attribute at all), `brokenImages`, `headings` (several h1 or skipped levels; 1.3.1, 2.4.6),
  `pageScrollsSideways`, `controlsOffscreen`, `coveredElements`, `clippedText` (1.4.10 and 2.4.11 symptoms), the root `lang`
  and `dir` values (3.1.1), and the page `title` (2.4.2).
- The audit accepts a `title` attribute as a name and cannot judge whether a name is useful. Read the names yourself:
  "button", "icon", "click here", a file name or a raw id is a defect even though the audit stays quiet.
- Not covered, so do by hand: keyboard operation, focus visibility and order, focus management, contrast, labels that
  exist but are wrong, error association and announcements, status messages, landmarks, link purpose, alt text quality,
  empty `alt=""` on informative images, target size, zoom and text spacing, motion, timing, authentication.
- Repeat the audit after every state change that adds UI (dialog opened, error shown, tab switched), not only on load.

## Checks

### Names, labels and instructions (1.1.1, 1.3.1, 2.5.3, 3.3.2, 4.1.2)
- Every text field, select, checkbox, radio, textarea and switch needs a programmatic label. In the snapshot it appears as
  the quoted name after the role. A placeholder alone is a defect: it disappears on typing and is not reliably a name.
- Prefer a visible `label` tied to the control (for/id match, or wrapping). Names from `aria-label` or `aria-labelledby`
  are fine when the purpose is obvious from context. `title` alone is weak. Check that the id a label points at exists and
  is unique (duplicate ids break the association).
- Icon-only buttons and links (close, edit, delete, menu, search, sort, row actions) need a name that says the action.
  Repeated row actions need to be distinguishable (the name includes which row) so a screen reader list of buttons is not
  twenty identical entries.
- Label in Name (2.5.3): if the visible text is "Search", the accessible name must contain "Search". A name that differs
  completely breaks voice control users.
- Radio groups and related checkboxes need a group name (fieldset and legend, or a labelled group). In the snapshot look
  for a `radiogroup` or `group` with a name, not loose radios.
- Required, format and unit hints must be text a user can reach, not only a colour or an asterisk with no explanation.
- Custom widgets (div-based select, switch, tabs) must expose role, name and state (selected, checked, expanded,
  pressed). In the snapshot a `generic` node that you can click means no role was exposed.

### Forms: errors, input help and authentication (3.3.1, 3.3.3, 3.3.4, 1.3.5, 3.3.7, 3.3.8, 4.1.3)
- Submit an invalid form. The error must be text (not only a red border), name the field, and say how to fix it. Tie it to
  the field (`aria-describedby`, or `aria-invalid` on the control) and move focus to the first invalid field or to a summary
  that links to each field. Defect: error appears visually but the snapshot shows nothing associated with the field, or
  focus stays on the submit button with no announcement.
- Inline errors that appear without moving focus need a live region (`role="alert"` or `role="status"`), see Status messages.
- Money, legal or irreversible actions need a review, confirmation or undo step (3.3.4 Error Prevention). Check that the
  confirm step exists before the final action, and that it shows the values about to be committed.
- Personal data fields (name, email, phone, address, password) should carry the matching `autocomplete` token (1.3.5
  Identify Input Purpose). Read the attribute with `evaluate`.
- Redundant Entry (3.3.7): in a multi-step flow, information entered earlier (shipping address, email) must be prefilled or
  selectable later, not typed again, except for security re-entry such as confirming a new password.
- Accessible Authentication (3.3.8): on the login and recovery pages, check that pasting into username, password and code
  fields is allowed, that password managers can fill (proper `autocomplete`, no script blocking autofill), and that there is
  no puzzle, transcription of distorted text or "enter the 3rd character" step without an alternative. A six-box code input
  that accepts a paste in only the first box is a defect. Do not trigger real SMS or email to test codes (see Safe on staging).

### Keyboard operation (2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 2.4.1, 3.2.1, 3.2.2, 2.1.4)
- Drive these checks with the key-press tool (`browser_press_key`): Tab, Shift+Tab, Enter, Space, Escape and the arrow keys.
  Read the snapshot after each press to see where focus went. Do not guess from markup.
- Tab through the whole page. Every control a mouse user can use must receive focus and work with the keyboard (Enter for
  links and buttons, Space for buttons, checkboxes and switches). Defect: a clickable `div` or `span` that never takes focus,
  a menu that opens only on hover, a row that is clickable only through a mouse handler.
- Focus Visible (2.4.7): after each Tab, read `document.activeElement` with `evaluate` (tag, name, bounding box) and take a
  screenshot if unsure. Defect: `outline: none` with no replacement, focus ring invisible on dark or coloured backgrounds.
- Focus Order (2.4.3): order must follow the reading and visual order. Defect: positive `tabindex`, focus jumping to the
  footer and back, a sidebar reached after the main content when it is visually first, off-screen items taking focus.
- Focus Not Obscured, Minimum (2.4.11, new in 2.2): while tabbing, the focused item must not be fully hidden behind a sticky
  header, footer, cookie bar or chat bubble. Test near the top and bottom edges and at 390 px wide. Typical fix is
  `scroll-padding` on the scroller.
- No Keyboard Trap (2.1.2): focus must be able to leave every widget with Tab or Escape (date pickers, rich text editors,
  embedded frames, modals are the usual suspects). Reaching a state where Tab only cycles inside something that is not an
  open modal is a defect.
- Bypass Blocks (2.4.1): pages with a long header or navigation need a skip link (usually the first Tab stop) or
  landmarks and headings that allow jumping. Activate the skip link and confirm focus lands in the main content.
- On Focus and On Input (3.2.1, 3.2.2): focusing a control or changing a select must not submit, navigate or reload
  unexpectedly. Defect: choosing a filter value that navigates away before the user can finish.
- Character Key Shortcuts (2.1.4): single-letter shortcuts must be switchable off or remappable, or only active on focus.
- Composite widgets (tabs, menus, listboxes, radio groups, grids) follow the usual pattern: one Tab stop for the group,
  arrow keys move within it, Enter or Space activates, Escape closes popups. Defect: every item is a separate Tab stop
  in a 40-item menu, or arrow keys do nothing.
- A scrollable region that has keyboard-focusable content inside is fine. A scrollable region with none may need to be
  focusable itself (`tabindex="0"`, a role and a name) so a keyboard user can scroll it. `overflow: clip` can leave focus
  on content that never scrolls into view.

### Focus management (2.4.3, 4.1.2, 3.2.2)
- Modal dialog: on open, focus moves inside (title, first field, or the least destructive button for a delete confirmation);
  Tab and Shift+Tab cycle inside; Escape closes; on close focus returns to the opener (or a sensible next element if the
  opener is gone). The container exposes `dialog` with a name (and `aria-modal` if the page behind is blocked). Defects:
  focus remains on the page behind, Tab escapes into the background, closing drops focus to the top of the page, no close
  control, background still scrolls or can be clicked.
- Menus and popovers: open with Enter, Space or Down; arrows move; Escape closes and returns focus to the trigger. Check
  `aria-expanded` flips with the state.
- Route changes in single-page apps: after navigating, the page title should change (2.4.2), focus or the reading position
  should move to the new content (heading or main), and the change should be perceivable without sight. Defect: URL and
  content change but focus stays on the old link and the title still names the previous page.
- Deleting an item, closing a toast or switching tabs must not leave focus on a removed element (it falls back to the body).
  Check where focus is with `document.activeElement` after the action.
- Loading states: when a section is replaced, check focus is not lost and the new content is announced when relevant.

### Structure, language and links (1.3.1, 2.4.2, 2.4.4, 2.4.6, 3.1.1, 3.1.2, 2.4.5)
- One descriptive `h1`, then headings in order. The audit lists skipped levels. Also check headings are real (not bold
  `div`), not empty, and that visual size is not the only cue of a heading.
- Landmarks: a page should expose `banner`, `navigation`, `main` (exactly one), `contentinfo`; repeated navigations need
  distinct names ("Primary", "Breadcrumb"). Content outside any landmark is a lead. Read them in the snapshot.
- Lists, tables and forms should use the real elements: data tables with header cells (`th`, with scope when complex) and a
  caption or name; layout tables should not announce as data tables. In the snapshot you should see `table`, `row`,
  `columnheader`, `cell`, `list`, `listitem`.
- Page Titled (2.4.2): title is unique per page and says what the page is. "Untitled", the bare app name on every page, or a
  title not updating after navigation is a defect.
- Language of Page (3.1.1): `html` has a valid `lang` that matches the content. Language of Parts (3.1.2): passages in
  another language carry their own `lang`. See `i18n-and-rtl.md` for direction.
- Link Purpose in Context (2.4.4): link text plus its context says where it goes. Repeated "Read more" or "Details" links
  must differ in name or have distinguishing context. A link that only wraps an image needs a name. Links that open a new
  tab or download a file should say so.
- Multiple Ways (2.4.5) and consistent navigation (3.2.3, 3.2.4): in a larger site expect at least two ways to find a page
  (menu plus search or index); repeated navigation keeps its order and the same function has the same label on every page.
- Consistent Help (3.2.6, new in 2.2): where help (contact, chat, FAQ link) appears on several pages it stays in the same
  relative place. Compare header and footer across a few pages.

### Images and non-text content (1.1.1, 1.4.5)
- Informative image: alt text conveys the meaning in context, not "image of" or a file name.
- Decorative image: `alt=""` (or hidden from the accessibility tree), never a missing attribute.
- Functional image (inside a link or button): alt states the destination or action. A logo that links home says so.
- Text in images (1.4.5): real text is preferred, unless it is a logo. Charts and complex images need the data available
  as text or a table nearby. Inline SVG icons need a name or must be hidden (`aria-hidden`).
- Check alt text against the picture (screenshot): a product photo labelled with another product's name is a defect.

### Colour and contrast (1.4.1, 1.4.3, 1.4.11, 1.4.13)
- Ratios: normal text 4.5:1; large text 3:1 (at least 24 px, or about 18.7 px and bold); meaningful non-text parts (input
  borders, icons that carry meaning, focus rings, chart marks) 3:1 against neighbours. Disabled controls, pure decoration and
  logos are exempt. Compare the unrounded ratio: 4.49 fails 4.5.
- Measure from computed styles with `evaluate` (read-only). This works when colours are in `rgb()` form and no image or
  gradient is behind the text; otherwise record "inconclusive" and judge from a screenshot. Opacity on ancestors, text
  shadows and overlays are not included, so confirm suspicious results visually.
```js
() => { const sel = "SELECTOR";
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const rgba = (s) => { const m = /^rgba?\(([^)]+)\)$/.exec(s); if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3]));
  const el = document.querySelector(sel), cs = getComputedStyle(el), fg = rgba(cs.color), layers = [];
  for (let n = el; n; n = n.parentElement) { const s = getComputedStyle(n), c = rgba(s.backgroundColor);
    if (s.backgroundImage !== "none") return { inconclusive: "image or gradient" };
    if (!c) return { inconclusive: "colour not rgb()" };
    if (c[3] > 0) layers.push(c); if (c[3] === 1) break; }
  let bg = [255, 255, 255]; for (const c of layers.reverse()) bg = over(c, bg);
  const text = fg[3] < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a), ratio = (hi + 0.05) / (lo + 0.05);
  const px = parseFloat(cs.fontSize), large = px >= 24 || (+cs.fontWeight >= 700 && px >= 18.66);
  return { ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, pass: ratio >= (large ? 3 : 4.5) }; }
```
- Sample the commonly weak spots first: placeholder and helper text, disabled-looking but active controls, text on
  coloured buttons and badges, links inside body text, footer text, text over images, error and success messages, chart
  labels, and every state (hover, focus, selected, dark mode if offered).
- Use of Color (1.4.1): status shown only by colour (red/green rows, required fields, chart series, link vs text) needs a
  second cue (icon, text, underline, pattern).
- Content on Hover or Focus (1.4.13): tooltips and popovers must be dismissible (Escape), hoverable (pointer can move onto
  them) and persistent until dismissed.

### Resize, reflow and text spacing (1.4.4, 1.4.10, 1.4.12, 1.3.4)
- Reflow (1.4.10): at a 320 CSS px wide viewport (the same as 1280 px at 400% zoom) content must work in one scrolling
  direction with nothing lost. Resize to 320 and run the audit; `pageScrollsSideways` or controls off-screen is a defect.
  Allowed exceptions: data tables, maps, diagrams and similar that truly need two dimensions, and only that block scrolls
  (in its own container), while headings, filters and pagination around it still reflow.
- Resize Text (1.4.4): text can reach 200% without loss. Check the viewport meta does not block zoom
  (`maximum-scale=1` or `user-scalable=no` is a defect). Font sizes in `vw` alone cannot be enlarged.
- Text Spacing (1.4.12): with line height 1.5, paragraph spacing 2x, letter spacing 0.12 em and word spacing 0.16 em applied
  (a user stylesheet), nothing may clip or overlap. If your tools cannot inject styles, mark it Not tested. Letter spacing
  does not apply to connected scripts such as Arabic and Urdu.
- Orientation (1.3.4): content must not be locked to portrait or landscape unless essential. Compare 390x844 with 844x390.

### Target size and pointer input (2.5.8, 2.5.7, 2.5.1, 2.5.2)
- Target Size, Minimum (2.5.8, new in 2.2): pointer targets should be at least 24x24 CSS px. A smaller target passes if a
  24 px circle centred on it touches no other target. Inline links in sentences, browser-native controls, and cases where an
  equivalent larger control exists are exceptions. Measure with `getBoundingClientRect()` for icon buttons, row actions,
  pagination, close buttons, checkboxes and chips at 390 px wide. About 44 px is the friendlier mobile target (AAA).
- Dragging Movements (2.5.7, new in 2.2): anything done by dragging (reorder, slider, map pan, file drop) needs a
  single-pointer alternative (buttons, a text field, a menu).
- Pointer Gestures (2.5.1): multi-finger or path gestures need a simple alternative. Pointer Cancellation (2.5.2): actions
  fire on release (click), not on press, so a slipped touch can be cancelled.

### Motion, timing and auto-updating content (2.2.1, 2.2.2, 2.3.1)
- Carousels, tickers, auto-refreshing lists, animated banners and videos that move for more than five seconds need pause,
  stop or hide. Check they do not restart on their own.
- Session timeouts and time limits must warn and allow extension (2.2.1 Timing Adjustable). Just note the policy; do not wait
  out real timeouts unless the config says how.
- Nothing flashes more than three times in a second (2.3.1). Check large animations respect the reduced-motion
  preference (`browser_emulate_media` can switch it on).

### Status messages (4.1.3)
- Messages that report a result or state without moving focus (search result count, "Saved", cart updated, a busy
  indicator, validation summary) must be exposed with `role="status"`, `role="alert"` or a live region that already exists in
  the DOM before the text changes. Check by triggering the action and looking in the snapshot or DOM for the container.
  Toasts that appear and vanish with no live region are a defect. Overusing `alert` for trivial messages is also one.
- A counter whose text changes should announce the whole phrase ("3 items"), not just the number.

## Reading the accessibility-tree snapshot for problems
- A bare role with no quoted name (a `button`, `link`, `textbox`, `combobox`, `checkbox`) is an unnamed control.
- A name that repeats ("Edit", "Edit", "Edit") or that is a raw id, a file name, "undefined", "null" or a translation key.
- A clickable thing that appears as plain text or `generic`: no role, so no keyboard or screen reader access.
- `img` with an empty or filename-like name; decorative images that should not appear at all but do.
- Headings: the `level` values in order of appearance; more than one level 1, or jumps of more than one level.
- Missing landmarks (`main`, `navigation`), many unnamed duplicate landmarks, or everything under one `generic` pile.
- Form controls missing the `invalid` state after a failed submit, or required fields not indicated.
- State attributes that do not change after use: `expanded`, `pressed`, `checked`, `selected` stuck at the old value.
- Hidden or off-screen content still listed (a closed menu or dialog present and focusable), or visible content absent
  from the tree (inside a closed shadow root or `aria-hidden` wrongly applied to a container that holds controls).
- Order of nodes that differs from the visual order.

## Severity hints
- **critical**: a key flow cannot be completed by keyboard (checkout, sign-in, submit), a keyboard trap, an unlabeled
  primary action, a modal that cannot be closed without a mouse, a login that blocks paste and password managers.
- **important**: missing labels on form fields, unlabeled icon buttons, no visible focus, focus not returned after a dialog,
  errors not tied to fields, contrast failures on body text, targets under 24 px with no spacing, text lost at 320 px.
- **minor**: heading level skips, missing landmark names, decorative image with a filename as alt, redundant "link" in names,
  title wording, contrast shortfall on large decorative text.
- Group by root cause: one unlabeled icon button component used on twenty rows is one finding.

## Safe on staging
- Everything above is read-only or uses QA- prefixed data. Do not submit real codes, passwords or payments to test
  authentication; test paste, autofill and the presence of an alternative only. Do not trigger real email or SMS.
- When screenshots show real people's data, describe it generically in the report.
- Do not claim full WCAG conformance. State the pages, viewports and criteria you actually checked, and list the rest
  (screen reader testing, captions, audio) as Not tested.

## Common bug patterns
- Design systems that style a `div` as a button; `outline: none` in a reset; icon buttons built from SVG without a name.
- Labels not connected (wrong `for`, duplicate ids), placeholder used as the label, `aria-label` contradicting visible text.
- Modals built without focus handling; focus restored to a node that was re-rendered; focus lost on list re-render.
- Single-page routing without title updates or focus moves; toasts without live regions injected in the same render.
- Fixed headers without `scroll-padding`; `overflow: hidden` on an ancestor clipping focus rings or popups.
- Zoom blocked in the viewport meta; fixed pixel widths; tables without a scroll wrapper.

## See also
`ui-and-layout.md`, `i18n-and-rtl.md`, `forms.md`, `bug-reporting.md`, `test-design.md`
