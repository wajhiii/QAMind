# Internationalization and right-to-left testing (Urdu, Arabic; Hebrew and Persian notes)

Load this when the product accepts or shows Urdu, Arabic, Hebrew or Persian text, offers more than one language, or formats
dates, numbers and money. RTL defects are among the most common ones that automated tools miss. The page audit gives leads
only: the root `lang` and `dir` values and `rtlTextInLtrContainer` (RTL text inside a box whose direction is left-to-right).
The rest needs the checks below.

## Working with the tools you have
- If the product has a language or direction switch, use it (and switch back afterwards). If it has none, test RTL content
  typed into the normal UI and note "no RTL interface offered"; that is not a defect unless the config says RTL users are
  supported. You may set `dir="rtl"` on the page with `evaluate` as a diagnostic experiment to see how the layout reacts (it
  changes only your browser's copy of the page), but do not report the result as a defect on its own: the product never
  offered that mode.
- Typing through automation inserts text directly. Real keyboard-layout switching, IME composition and some caret
  behaviour cannot be fully reproduced; use Home, End and arrow key presses (`browser_press_key`) to check caret movement, and list real IME
  composition under Not tested.
- Compare stored text through the API runner with a JSON path `equals` check, not `body_contains`: JSON may escape non-ASCII
  characters (`آ`), so a raw body search can fail on correct data.
- Every record you create keeps the `QA-` prefix, so it starts with a Latin letter. That matters for `dir="auto"`, which
  follows the first strong letter: these strings resolve to left-to-right on purpose. To judge `auto` behaviour, use a
  multi-paragraph text area (each paragraph decides by itself) or existing content that starts with Urdu or Arabic.

## Bidirectional text in plain terms
- Text is stored in the order it is typed (logical order). The browser reorders it for display using a fixed algorithm.
- Letters are strong: Latin letters run left to right, Arabic, Urdu, Hebrew and Persian letters run right to left. Digits are
  weak: they keep left-to-right order as a group. Spaces, punctuation and symbols are neutral and take their direction from the
  strong text around them.
- The base direction of a block (what the line starts from, which side is "start") comes from `dir` on the element or an
  ancestor, or from the first strong letter when `dir="auto"`. `lang` never sets direction, so both attributes are needed.
- A neutral between two runs of the same direction joins them; a neutral between runs of different directions falls back to
  the block direction. Most visual bugs happen at those boundaries: a number, hyphen, slash or bracket next to text of the
  other direction.
- Verified in a Chromium browser (A means an Urdu letter). Your result may be the same, but check it:
  - In an RTL block, `ref-1042` stays intact: a hyphen between a Latin letter and digits behaves as left-to-right text.
  - In an RTL block after Urdu text, `1042-A` is shown as `A-1042` (segments swapped), and the date `2026-03-04` is shown as
    `04-03-2026`. Slashes (`2026/03/04`) stay intact. The same hyphenated date alone, with no Urdu letter before it, is fine.
  - A phone number `+92 300 1234567` after Urdu text is shown as `1234567 300 92+`.
  - A leading sign, `-5`, `#1042` or `$5`, ends up on the opposite side of the digits (`5-`, `1042#`, `5$`) in an RTL block.
  - In a left-to-right block, `Order <Urdu word> 1042` pulls the number to the left of the Urdu word. Wrapping the Urdu word
    in a span with `dir="rtl"` fixes it. Trailing punctuation after Urdu in a left-to-right block lands on the wrong end.
  - Wrapping codes, dates, phone numbers and e-mail addresses in `<bdi>` or an element with `dir="ltr"` keeps them intact.
- Fixes belong in markup: `dir` on the root, `dir="auto"` or `<bdi>` for text that comes from users or the database, and
  `dir="ltr"` for codes, phone numbers, ids and e-mail addresses. Invisible marks (U+200E, U+200F) can help but are fragile.

## Test strings (type exactly; keep the QA- prefix at the start of saved values)
Urdu
- `QA-ٹیسٹ آرڈر 1042 کی تفصیل` plain Urdu with Western digits
- `QA-آرڈر ref-1042 کی تفصیل` and `QA-آرڈر 1042-A کی تفصیل` identifiers inside a sentence
- `QA-تاریخ: 2026-03-04 فون: +92 300 1234567` hyphenated date and phone after Urdu
- `QA-قیمت: ۱۲۳۴ روپے (Rs 1,234.50)` Extended Arabic-Indic digits next to Western digits and currency
- `QA-ٹماٹر ڈبہ بڑا چھوٹا گھر ںے ۓ` letters that Arabic-only fonts may lack
- `QA-کیا یہ درست ہے؟ (ہاں) "ٹھیک ہے"۔` Urdu question mark, brackets, quotes and full stop
- `QA-اُردُو زبان` with vowel marks; and the same word without marks
- `QA-محمد عبدالرحمن یوسف زئی` repeated until about 300 characters, and a 100-character run with no spaces
Arabic
- `QA-مرحبا بالعالم 2026` and `QA-طلب رقم ABC-1042 تم استلامه`
- `QA-السعر: ١٢٣٫٤٥ ريال` Arabic-Indic digits and the Arabic decimal separator
- `QA-السَّلَامُ عَلَيْكُمْ` letters with many vowel marks
- Search variants: `QA-أحمد`, `QA-احمد`, `QA-إحمد`; `QA-مدرسة`, `QA-مدرسه`; `QA-مــرحبا` (with tatweel)
- Letter variants of Urdu and Persian: `QA-کیا` (U+06A9, U+06CC) against `QA-كيا` (Arabic kaf and yeh, U+0643, U+064A)
Other
- Persian `QA-می‌خواهم ۱۲۳` (contains a zero-width non-joiner, U+200C); Hebrew `QA-שלום עולם 123`
- Emoji and invisible marks: `QA-😀 👨‍👩‍👧 🇵🇰`; an identifier followed by U+200F; a name containing U+202E (bidi override)
Defects look like: question marks or boxes instead of letters; letters shown separate instead of connected; segments or
digits in a different order than typed; punctuation or signs on the wrong side; text cut off, overlapping or vertically
clipped; text that is stored, returned or exported differently from what was typed.

## RTL smoke test (about 15 minutes)
1. Pick the main list page, a create or edit form, a detail page, a confirmation or summary screen, an error state and
   the search box. Add the sign-in page and any export or print view if they exist.
2. In every free-text field (name, title, notes, address, search) save each Urdu and Arabic string above. Use a numeric field
   for the digit tests (see Numerals) and a date field for the date tests.
3. For each saved value check: the form after saving; the list row, card and table cell; the detail page; dropdown or
   autocomplete options; breadcrumbs, page title and toasts; the confirmation page; the exported file; the value returned by the
   API. It must be identical to what you typed, and shown correctly every time.
4. At desktop and 390 px wide, run the page audit and the element probe below. Take a screenshot of every screen that shows
   Urdu or Arabic.
5. Search for the value (full, partial, with and without marks), sort the list by that column, and filter by it.
6. If the product has a language switch, repeat steps 2 to 5 in RTL mode and compare layout with the LTR version.
7. Probe for the Arabic-script elements (read-only):
```js
() => [...document.querySelectorAll("body *:not(script):not(style)")]
  .filter((e) => e.children.length === 0 && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(e.textContent))
  .slice(0, 30).map((e) => { const s = getComputedStyle(e), fs = parseFloat(s.fontSize);
    return { el: e.tagName.toLowerCase() + (e.id ? "#" + e.id : ""), dir: s.direction, align: s.textAlign, bidi: s.unicodeBidi,
      letterSpacing: s.letterSpacing, lineHeight: s.lineHeight === "normal" ? "normal" : Math.round(parseFloat(s.lineHeight) / fs * 100) / 100,
      font: s.fontFamily.split(",")[0], clipped: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
      text: e.textContent.trim().slice(0, 20) }; });
```
   Leads: `dir: ltr` on Urdu or Arabic text; `align: left` on RTL text; `bidi: bidi-override`; `letterSpacing` other than `normal`
   or `0px`; a tight `lineHeight` (about 1.2 or less) on Urdu; `clipped: true`.

## Checks

### Markup: lang and dir
- The `html` element has the right `lang` (`ur`, `ar`, `he`, `fa`, or a region form such as `ur-PK`) and, for an RTL
  interface, `dir="rtl"`. Direction should come from the attribute, not only from CSS. A page in RTL with `dir="ltr"` or no `dir`
  is a defect. A language switch must update both attributes and the page title.
- Passages in a different language inside a page carry their own `lang`, and their own `dir` when the direction differs
  (an English quotation inside an Urdu page).
- User-generated and database text in lists and tables: `dir="auto"` on the element, or `<bdi>` around inline names.
  Without it, an Urdu name in an English table (or the reverse) can pull neighbouring punctuation and numbers into the wrong
  place. Inputs and text areas that take free text benefit from `dir="auto"`; search boxes especially.
- Codes, numbers, e-mail addresses and URLs should be isolated as left-to-right (`dir="ltr"` or `<bdi>`), so they read the
  same in every language. Telephone inputs are always left-to-right.

### What breaks RTL (check computed styles and screenshots)
- Forced `direction: ltr` or `text-align: left` on containers that hold user text; `unicode-bidi: bidi-override` on content (it
  reverses text and also makes spoofing possible). Overrides belong only on demo or teaching text.
- Physical CSS: `margin-left`, `padding-right`, `border-left`, `left: 0`, `float: left`, `text-align: left` and sliding
  panels moved with `translateX`. Logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`,
  `text-align: start`, `float: inline-start`, `inline-size`) follow the direction automatically. Symptoms in an RTL interface:
  icon gaps on the wrong side of the label, a badge or close button in the wrong corner, a drawer that opens from the wrong
  edge, indentation and borders on the wrong side, a sidebar that stays on the left.
- Fixed widths and heights sized for Latin text; a column that was exactly as wide as the English label.
- Hard-coded arrows and chevrons (`>` or `→` characters, background images) that point the wrong way in RTL.

### Shaping, joining, fonts and line height
- Arabic-script letters change shape depending on neighbours and must join. Never apply `letter-spacing` (other than
  `normal`) to Arabic, Urdu or Persian text, never split a word into separate spans per letter (animation, highlight, "hover
  each letter"), and never insert characters inside words. Broken joining looks like disconnected letters.
- A single global `letter-spacing` or `text-transform` on a heading or button style often hits Urdu text by accident; read
  `letterSpacing` in the probe.
- Missing glyphs: boxes, question marks or blanks where a letter should be. Urdu needs letters beyond the Arabic set
  (such as ٹ ڈ ڑ ں ھ ہ ے ۓ پ چ ژ گ); a font made for Arabic alone may lack them, and a browser then substitutes a different
  font that looks inconsistent. Check inputs, buttons, tables, tooltips, toasts, charts (canvas text), PDFs and e-mails separately: they
  use different fonts. Naskh-style text where the brand uses Nastaliq is a minor design note, not a bug.
- Line height: Urdu in Nastaliq style has ascenders and descenders that reach much farther than Latin letters. Look for dots
  and tails cut off at the top or bottom in buttons, badges, table cells, inputs, tabs and headings with a fixed height, a tight
  `line-height` or `overflow: hidden`. Neighbouring lines of wrapped Urdu must not touch. Mixed Latin and Urdu on one line
  must stay aligned on the baseline.
- Vowel marks (harakat, zabar, zer, pesh) must sit on their letters and not be clipped or detached. Copy and paste and
  search must not drop them silently.

### Truncation, wrapping and long strings
- Ellipsis follows direction: for RTL text it should appear on the left, where the text ends. If an LTR box clips RTL text, the
  ellipsis is on the wrong side or the first words are cut. Truncation must leave the identifying part of a value visible
  (see `ui-and-layout.md`).
- Long names and unbroken strings: a 100-character Urdu or Arabic run with no spaces, a long URL, and a very long multi-word
  name must wrap or scroll inside the box and not widen the page. Line breaks should happen between words, not in the middle
  of a joined word.
- Truncating in script by character count (substring, slice) can cut a base letter from its vowel marks or break a surrogate
  pair (emoji); the result shows replacement characters.

### Inputs and caret
- Fields that take Urdu or Arabic must align text to the start side (right in RTL), show the caret on the right, and keep
  the typed text in order while typing, pasting and deleting. Mixed typing (type Urdu, then a Latin word, then digits) must
  stay stable and not jump.
- Placeholders, labels, hints and error text appear on the correct side and in the page language. A placeholder in an RTL
  field that aligns left is a lead.
- Validation: a name field that rejects non-ASCII letters is a defect (common regexes such as `[a-zA-Z]` or `\w` do exactly
  that). Check name, address, city, notes, search, and any field that accepts text. Also check trimming of leading and trailing
  spaces, and invisible characters (U+200E, U+200F, U+200B, U+200C, U+FEFF) pasted at the end of a login or id: they must
  be stripped or rejected clearly, since otherwise two values that look identical on screen are different to the system and
  can bypass uniqueness checks or fail lookups.
- Display spoofing: a name containing U+202E (bidi override) must not scramble neighbouring columns or buttons when shown in a
  list or a table. Isolation (`bdi`, `dir`) or stripping contains it. Report as hardening unless it can mislead about money or
  permissions.

### Mirroring: what should and should not flip
- Flip in RTL (meaning follows reading direction): page layout order, the side of a sidebar or drawer, navigation order,
  breadcrumbs, steppers and progress bars (fill from the right), pagination and back or forward arrows, chevrons that mean
  next or previous, undo and redo, reply and send icons, list indentation, text alignment, label-to-field side,
  checkbox and switch position, slider direction, tabs order, table column order, popover placement, corner placement of
  close buttons and badges.
- Do not flip: logos and brand marks, photos, clocks, check marks, icons that depict real objects, media play controls,
  digits and Latin text, code, phone numbers, charts' data (decide by what the chart shows), and anything the product
  states is intentionally left-to-right.
- Judge icons by meaning: if it expresses direction or progress, it should mirror.

### Numerals, number, date and currency formats, calendars
- Three digit systems exist: Western (0-9), Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹, used for Urdu and Persian; the
  shapes of 4, 5, 6 and 7 differ from Arabic-Indic). Which one a locale uses by default depends on the locale data. In one
  runtime I checked, `ar-EG` and `ar-SA` gave Arabic-Indic digits, `ar-AE` and `ur-PK` gave Western digits, and `ur-IN` and `fa-IR`
  gave Extended Arabic-Indic digits. Do not assume; look at what the product does and check it is the same on every screen
  (list, detail, summary, export, e-mail) and agrees with the product's own statement.
- Numeric input: type Western, Arabic-Indic and Extended digits into quantity and amount fields. Acceptable outcomes are
  accepted and converted, or rejected with a clear message. Defects: silently becoming 0 or NaN, passing client validation
  and failing on the server, or being stored as a different number. Runtimes disagree: JavaScript `Number("١٢٣")` is NaN,
  while Python `int("١٢٣")` is 123, so a client and a server may judge the same input differently.
- Separators: decimal and thousands marks differ by locale (`1,234.50`, `1.234,50`, Arabic `٫` and `٬`, South Asian lakh
  grouping such as `12,34,567`). The same amount must have the same value and grouping on all screens and in the API. A
  decimal comma parsed as a thousands separator can make 1,5 into 15.
- Currency: symbol or code, its side, decimals and sign. Test the sign: a minus before digits can display on the far side
  in RTL. Percentages and a currency symbol can also swap sides. Compare with what a locale-aware formatter produces for
  that locale.
- Dates and calendars: day-month order, month names in the language, week start (Saturday, Sunday or Monday depending on
  the market), weekend days in date pickers, and picker headers and arrows in RTL. Some locales use another calendar (in the
  runtime I checked `fa-IR` used the Persian solar calendar); a Hijri or solar year shown where a Gregorian one is expected
  is a defect unless the product intends it. Round-trip a date: enter, save, reload, and compare in UI and API.
- Time zones: store and send UTC, show in the user's or business's zone with a label. Dates without time can move a day: a
  date-only value parsed as UTC shows the previous day in zones behind UTC (in a test run with the zone set to New York,
  `new Date("2026-10-30")` printed as 10/29).
  Test values close to midnight, month and year ends, and daylight-saving changes, in the list, detail, export and API.
  If the tools cannot change the zone, say so and list it under Not tested.

### Sorting, search and normalization
- Sorting by an Urdu or Arabic column should follow the language's alphabet, not raw code points. In the runtime I checked,
  a default sort put `پ` after `ٹ` while a locale-aware collator placed it after `ب`. Mixed Latin and Urdu lists should
  group sensibly and be stable.
- Search: the Urdu or Arabic term must find the record, partial and full. Check the Latin part of mixed values (case
  does not exist in Arabic script, but locale rules do: Turkish dotless i is a classic). Typical product choices that you
  should probe and report as suggestions if missing: ignore vowel marks and tatweel, fold the alef forms (أ إ آ ا), fold
  ة and ه, fold Urdu and Persian yeh and kaf (ی ک) with Arabic ones (ي ك), and treat Arabic-Indic and Western digits alike.
- Unicode normalization: the same visible text can use different code points. Latin accents (é as one code point or e plus a
  combining mark) are fixed by normalizing to one form; compatibility forms (Arabic presentation forms from copied PDF text)
  fold with the compatibility forms. Letter variants such as ك and ک are different letters and normalization will not merge
  them. Test: save one value in two forms; a uniqueness rule, a search and an equality check should treat them the way the
  product intends, and a duplicate created through a lookalike is a finding.
- Highlighting matches inside Arabic-script words must not break joining or add spaces.

### Translations: expansion, plurals, concatenation, hard-coded text
- Text expansion: translated labels are often longer than English. Look at buttons, tabs, table headers, tooltips and menus
  with a long label; check fixed widths, clipped labels, and wrapped text that breaks alignment.
- Plurals: languages have different categories. Arabic distinguishes zero, one, two, few, many and other (0, 1, 2, 3, 11, 100
  differ); English and Urdu have one and other. A count message that only checks `n == 1` is wrong in Arabic. Test 0, 1, 2,
  3, 11, 100 and 1.5.
- Sentences built from pieces ("Hello, " + name + "!", `Delete "` + name + `"?`) read wrongly when word order or
  punctuation direction changes. Insert a name of the opposite direction and check punctuation and order. A link in the
  middle of a sentence must stay inside the sentence in RTL. Inserted names should be isolated with `bdi`.
- Hard-coded text: switch language and look for English left behind in validation messages, toasts, empty states, 404 and error
  pages, `aria-label` and `title` values, placeholders, page titles, dropdown options from the API, API error messages shown to
  users, date pickers, e-mails and PDFs (only those you can generate safely). Raw keys (`orders.title`) are defects.

### Encoding and length, end to end
- UTF-8 from the form to the database and back: save the test strings, reload, read through the API, export. Defects: `?`
  or U+FFFD replacement characters, mojibake such as `Ø§Ù„` (UTF-8 read as Latin-1), visible escapes (`ا`, `&#1575;`), double-encoded
  entities, URLs and query strings that lose characters (test `?q=` with Urdu and a Unicode slug).
- Database columns and tables that cannot store four-byte characters can reject or cut emoji (an error or a 500 on emoji is
  a finding).
- CSV and spreadsheet exports: spreadsheet apps often misread UTF-8 text without a byte-order mark; check the file bytes and
  open the file in a viewer that shows the characters. PDFs and printable pages: letters must be connected, in order, with no
  boxes, and digits and amounts must not be reversed; generators without shaping support show disconnected or reversed letters.
  File names with Urdu characters on download should survive. E-mail content only where a safe outbox exists, otherwise Not tested.
- Length limits: JavaScript `length` counts UTF-16 units (one emoji is 2, a family emoji 8), an Urdu letter is 2 bytes in
  UTF-8, and databases count bytes or characters depending on the column. Test one below, at and above the limit with Urdu
  and with emoji. The counter, the client check, the server check and the stored value must agree, and cutting must never split
  a character or a letter with its marks.

## Severity hints
- **critical**: Urdu or Arabic data stored, returned or exported wrongly or lost; records unfindable or duplicated because of
  normalization; amounts, dates or ids shown so they can be misread (reversed digits, sign on the wrong side) in a flow
  involving money; users of that script cannot complete a key form.
- **important**: RTL layout broken in main flows; Urdu clipped or glyphs missing; identifiers, dates or phone numbers scrambled;
  validation rejecting valid names; hard-coded English in key flows; wrong sort order; length rules inconsistent; plural
  forms wrong; PDF or export unreadable.
- **minor**: unmirrored decorative icons, small alignment issues, a few untranslated strings on rare screens, Naskh fallback
  instead of Nastaliq, trailing punctuation placement.

## Safe on staging
- All text goes into QA- prefixed records only; clean up only what you created. Do not send real e-mail or SMS to test
  encoding; do not paste real people's names or numbers.
- U+202E and other invisible characters go only into your own QA- fields. Do not use them in any shared or global setting.
- Keep evidence small: a screenshot of the affected row or field, the exact string in the report text (copy-paste of the
  Unicode, not a picture of it).
- Switching language or direction on a shared test account: switch it back at the end.

## Common bug patterns
- A global `direction: ltr`, `text-align: left` or `letter-spacing` in a base stylesheet; physical margins, floats and
  `left`/`right` offsets; fixed widths and heights.
- Name and text validators limited to Latin letters; slug and id generators that remove non-ASCII characters (an Urdu title
  becomes an empty or colliding slug); `toUpperCase`, `substring` or `.length` used on text.
- String concatenation for sentences; plural handling written for English; default locale taken from the server instead of
  the user.
- Date handling from strings (`new Date("2026-10-30")` is parsed as UTC), time zones missing from storage, date-only values
  treated as timestamps.
- Database or connection not on full UTF-8; missing charset in e-mail or CSV; fonts without Urdu glyphs in PDF generation;
  libraries that do not shape or reorder Arabic script in canvas or PDF.
- Sorting with raw comparison instead of a locale-aware collator; search without any normalization.

## Hebrew and Persian notes
- Hebrew: `lang="he"`, `dir="rtl"`; letters do not join, but vowel points (niqqud) are combining marks that must not be
  clipped or dropped; Western digits are the norm; the same bidi problems with ids, dates and phone numbers apply.
- Persian: `lang="fa"`; Extended Arabic-Indic digits and Persian letter forms (ک ی گ چ پ ژ) are expected, Arabic ك ي in
  text typed with an Arabic keyboard are a search and display trap; half-spaces (U+200C) inside words must be preserved and not
  stripped by trimming or normalization; the Solar Hijri calendar and a Saturday week start are common.

## See also
`ui-and-layout.md`, `accessibility.md`, `forms.md`, `search-filter-pagination.md`, `file-uploads.md`, `api-testing.md`
