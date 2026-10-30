# File uploads and downloads

Load this when the product accepts files (avatars, attachments, documents, CSV imports) or serves them back (downloads,
previews, exports, invoices). Uploads combine validation, storage and access-control bugs, so test all three. Every check
below uses small, harmless files that you create yourself.

## Prepare safe test files
- Create them with a short script inside the run folder, named `QA-...`, and delete the local copies when finished.
- Set: a tiny valid file of every allowed type; a zero-byte file; a file at exactly the documented size limit and one byte
  over; a plain text file renamed to an allowed image extension; a real image renamed to a different extension; a file with a
  double extension such as `QA-notes.pdf.txt`; an upper-case extension; a corrupt (truncated) image; a plain-text file
  containing `<b>QA-markup</b>`; an SVG with only visible text (no scripts).
- Never create or upload real malware, executables, scripts meant to run, archive bombs or exploit files.
- Use the browser file-input tool (`browser_file_upload`) for uploads through the UI. The API runner sends JSON or plain-text
  bodies only (no binary or multipart bodies), so list API-level multipart upload checks under Not tested unless a text body is
  enough, and say why.

## Checks

### 1. Inventory
- List every upload point (UI and API), the allowed types, size limits, file count limits and quota, from the UI text, the spec
  and the config. Note where an uploaded file appears afterwards (list, preview, download, email attachment).

### 2. Type rules
- Upload each allowed type: it must succeed, display or preview correctly, and download intact.
- Upload disallowed types (an executable-looking name, a text file where only images are allowed): refused with a clear
  message that lists what is allowed. Check the refusal happens on the server too, not only in the file chooser filter.
- The extension, the declared content type and the real bytes must all be consistent. A renamed text file accepted as an image,
  or a real image accepted under a disallowed extension, means the product trusts the name or the client-supplied type.
  Validation should rest on an allowlist and on the actual content.
- Double extensions, upper-case and mixed-case extensions, a trailing dot or space, no extension, a name that is only an
  extension (`.png`), and a hidden-file name: each is either handled by the rule or refused.

### 3. Size and count limits
- At the limit passes, one byte over fails. The message states the same number the server enforces.
- Compare the UI limit with the server limit by trying exact values; a mismatch between the page text and behavior is a defect.
  Clarify units: a "5 MB" limit can mean 5,000,000 or 5,242,880 bytes; if the product is ambiguous, test both and note it.
- Over-limit rejections must be clean: a clear 413 or a readable message, not a 500, a dropped connection with a spinner, or an
  HTML error page from a proxy.
- Total size for several files, and the maximum number of files per upload or per record.
- Empty file: refused with a message, or accepted on purpose and handled without a crash.
- If no limit is documented, upload one file moderately larger than a typical document (for example up to about 10 MB), once,
  and report "no limit seen" rather than pushing further.

### 4. File names
- Very long names (255 and 256 characters), names with spaces, quotes, `#`, `%`, `&`, a leading dot or hyphen, a colon, and
  path-looking names (`../QA-x.txt`, `..\QA-x.txt`). Names should be sanitised or replaced; storage must never leave the
  upload folder.
- Unicode names: accents, emoji, Arabic and Urdu, combined characters. The name must display correctly in the list, appear
  properly in the download header, and survive a round trip.
- Name containing `<b>QA</b>`: shown as literal text everywhere (list, preview, emails).
- Duplicates: the same name twice by the same user (a new copy, a clear overwrite warning, or a refusal, but not silent
  loss); the same name with different content; the same name by two users must never overwrite each other (critical if it does);
  names that differ only by case.

### 5. Interrupted and parallel uploads
- Cancel during an upload (use a file large enough to give time), navigate away, close the dialog: no half-created record,
  no orphan file visible, and the product shows the real result.
- Progress indicator reaches completion only when the upload has really finished; failures show a message and offer retry;
  a failed upload never appears in the list as if it succeeded.
- Several files at once: partial success is reported per file; removing a file before submit works; replacing a file replaces
  it everywhere.
- Double submit of the same upload yields one stored file.
- Cancel the surrounding form after the file uploaded: the stray file is cleaned up or clearly reusable.

### 6. Scanning flows
- Do not upload real malware. If the product documents antivirus scanning, use the industry-standard harmless antivirus test
  string only when the product's docs or config name it as the way to test the scanner. Create it in the run folder, upload it
  once, and delete it afterwards (local security software may quarantine it).
- Expected: the file is rejected or quarantined with a clear message, and is never downloadable. While scanning is pending
  the file is not downloadable. If the scanner is unavailable or times out the product fails closed (refuses), not open.
- Without a documented scanner or test method: list the scanning check under Not tested.

### 7. Storage and path exposure
- From the upload response, page source, links and network requests, look for server file system paths, internal bucket or
  storage keys, sequential or guessable file names (`/uploads/1.png`), and the original name used as the storage name.
  Exposed paths or guessable names are a lead (important); combined with missing access control, critical.
- One request to the upload folder URL (not a crawl) to see whether a directory listing is shown.
- Uploaded content should be served from a location that cannot run it, not from a folder where scripts execute.
- API responses for files should not include other users' information or internal fields.

### 8. Access control on downloads
- As the uploader, copy the file URL. Open it in a fresh, empty browser profile (no session) and request it with the API runner as
  `anonymous`. Private files must refuse (401/403/404); files meant to be public must say so in the spec or UI.
- With two test accounts you control: A uploads, B requests A's file by URL and by id. Expect 403 or 404 (the cross-account chain
  described in `permissions-and-data-isolation.md`). Also try B changing the id in the download request.
- Do not enumerate other people's files. If one neighbouring id returns a file you did not upload, record only the status,
  headers and size, no content, stop, and report it.
- Signed or expiring links: they must expire as documented, and stop working after the user loses access or signs out if the
  rule says so.
- Deleting a file or its parent record must stop the URL from working (also thumbnails and cached copies).
- Download parameters that name files (`?file=`): try a few traversal-style values pointing to another file you created, never to
  system files; the product must refuse.
- Upload endpoints require a signed-in role; an anonymous upload attempt must be refused. Also check the upload cannot be
  triggered cross-site without a token where the product uses cookie sessions.

### 9. Images and documents
- Images: a photo with fake GPS metadata (use obviously fake coordinates) must have that metadata removed from any
  copy served to others, if the product claims or implies it. Check orientation, transparency, CMYK or progressive files,
  animated images, thumbnails, aspect-ratio cropping and alt text.
- Large dimensions: upload one image with large dimensions but small file size (for instance 5,000 x 5,000 pixels, solid color)
  once. The product should handle it or refuse it clearly within a reasonable time. Stop if the request takes more than
  about 30 seconds; never repeat it or go bigger.
- Corrupt or truncated image and a wrong-format file: a friendly error, no 500, no half-saved record.
- SVG: serve check only. Request the file and read the response headers: how is it delivered (content type, inline versus
  download)? Flag unprotected inline serving as a lead. Do not add scripts to test it.
- CSV and spreadsheet imports: header missing, extra columns, BOM, other delimiters, quoted line breaks, wrong encoding,
  duplicate rows, a row limit, a cell starting with `=` (stored text, and neutralised on later export), and partial failure
  reporting per row with line numbers. No row should be silently dropped.
- Archives: if accepted, upload one small valid archive holding one harmless file. Do not upload archive bombs or names meant
  to escape the target folder; list those under Not tested ("would risk denial of service or writing outside storage").

### 10. Download behaviour
- The downloaded bytes equal the uploaded bytes (compare hashes). Names with unicode and spaces arrive correctly.
- The content type matches the file. Attachments that should download use an attachment disposition; types that could carry active
  content are not rendered inline from the product's origin. Check for a header that stops content-type guessing.
- Private files should not be cacheable by shared caches: look at the cache headers.
- A deleted or missing file returns 404 with a normal error page, not a stack trace or server path.
- Export files (CSV, PDF, invoices): contents equal the screen and the API; names meaningful; large exports finish or fail
  cleanly; the export covers only the caller's data.

### 11. Cleanup
- Remove every file and record you created, using the product's own delete function, and check the URL stops working.
- Report anything you could not delete (so the user can remove it) and keep it listed in the notes.
- Do not delete files you did not create; do not clear storage or folders.

## Severity hints
- **critical:** any user can read, overwrite or delete another user's file; anonymous upload or download of private files; a
  file with active content served so it runs in the product's origin; scanning bypassed; server paths plus traversal exposure.
- **important:** wrong type or oversized files accepted; limits differ between UI and server; interrupted uploads leave orphan
  or phantom records; metadata (GPS) retained; a confusing or technical error on rejection; names corrupted.
- **minor:** wording of limit messages, progress indicator oddities, thumbnail cropping.

## Safe on staging
- Small, harmless files only, created by you, `QA-` prefixed. No malware, no exploit payloads, no archive bombs, no
  oversized files beyond one byte over the limit (or the single moderate test above).
- Prefer two test accounts you control for access tests; never open other people's files. Minimal evidence: status codes,
  headers, sizes.
- Delete what you upload. If a file can't be deleted, record its name in the report notes.

## Common bug patterns
- Validating the extension or the client-supplied content type only, instead of the content.
- Blocklist of "bad" extensions instead of an allowlist.
- Size limit implemented in the browser only, or differing between the proxy and the app.
- User-supplied name used as the storage name (overwrites, traversal), or predictable sequential storage names.
- Files stored in the web root, or served by a static handler that skips the permission check.
- Download endpoint checks login but not ownership.
- Original image served with metadata; thumbnails served from a public path while originals are protected.
- Partial files left after cancel or failure; no cleanup when the parent record is deleted.
- Processing done in the request thread, so large images time out.

## See also
`forms.md`, `test-design.md`, `search-filter-pagination.md`, `notifications-email.md`.
