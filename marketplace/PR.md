# Add fishyu1201/dsh-latex-preview

Adds one entry: `data/plugins/fishyu1201__dsh-latex-preview.yml`.

**What it does.** Typesets LaTeX in the DeepSeek Harness composer while you draft,
so `$…$` reads as math before you send it. It also flags a formula KaTeX cannot
parse — and a delimiter left unclosed — before the message goes out. Sent messages
are typeset too. And any selection that touches a rendered formula copies as LaTeX
source rather than as KaTeX's concatenated MathML and glyph output.

**The message is never rewritten.** The plugin reads the draft and renders a copy;
it does not write to the composer, intercept submission, or alter a delimiter. A
test types a 215-character draft and asserts the composer text is byte-identical
to what was typed; the browser run asserts the same end to end and reads the
message-level copy back off the real clipboard.

**Installability.** `package.json` declares `dsh.bundle` and `client.platform:
web`; `cordis.patch.yml` sits beside it and inserts the row by package name. The
built `client.js` is committed, so `dsh plugin add` needs no build step and no
`allowBuilds` permission.

**Checks run against the listed requirements:**

- `dsh plugin --profile web add <a fresh clone of this repo>` — installed and
  booted in an isolated `DSH_HOME`, then driven through the real Web UI in
  headless Chrome: preview renders, caret bench follows the cursor, a malformed
  formula is flagged, sent messages typeset, all four copy gestures return source,
  settings section mounts. 0 failures, 0 console errors.
- 57 unit tests (`npm test`), including 12 for the copy serializer alone.
- Every claim in the entry's description maps to a verified behaviour; see
  `CONFORMANCE.md` in the repository for the standards audit, including three
  stated deviations.

**Category.** `ui` — it is composer and transcript presentation. Not `docs`: it
does not touch LaTeX documents, only how math reads inside a conversation.
