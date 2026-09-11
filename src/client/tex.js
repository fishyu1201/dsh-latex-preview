/**
 * Math span scanner for the composer draft.
 *
 * The preview is a lens, never a transform: this module only *locates* math in
 * the text the user is already typing, so the dock can typeset it without the
 * draft (and therefore the request) changing by a single byte.
 *
 * Recognised delimiters:
 *   `$$…$$`  display   — what the Harness markdown renderer typesets
 *   `$…$`    inline    — what the Harness markdown renderer typesets
 *   `\[…\]`  display   — LaTeX-native; flagged, because the transcript will not typeset it
 *   `\(…\)`  inline    — LaTeX-native; flagged, for the same reason
 *
 * Skipped, so a shell snippet or a `$PATH` mention never becomes a formula:
 *   - fenced code blocks (``` / ~~~, three or more markers)
 *   - inline code spans (`…`, matching run length)
 *   - escaped delimiters (`\$`, `\\`)
 */

/** A fence opener: up to three leading spaces then three or more backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/** Delimiter provenance, surfaced so the UI can warn about non-typesetting forms. */
export const DELIM = {
  DOLLAR: '$',
  DOUBLE_DOLLAR: '$$',
  BRACKET: '\\[',
  PAREN: '\\(',
}

/** Delimiters the markdown transcript actually typesets. */
const TYPESET = new Set([DELIM.DOLLAR, DELIM.DOUBLE_DOLLAR])

/**
 * Read a fence opener at a line start.
 * @param {string} text - full draft.
 * @param {number} lineStart - index of the first character on the line.
 * @returns {{char: string, len: number, after: number} | null} the opener, or null.
 */
function readFence(text, lineStart) {
  const probe = text.slice(lineStart, lineStart + 12)
  const match = FENCE.exec(probe)
  if (match === null) return null
  const run = match[1]
  return { char: run[0], len: run.length, after: lineStart + match[0].length }
}

/**
 * Whether only whitespace remains on the line beginning at `from`.
 * @param {string} text - full draft.
 * @param {number} from - index to inspect from.
 * @returns {boolean} true when the rest of the line is blank.
 */
function blankToEol(text, from) {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\n') return true
    if (ch !== ' ' && ch !== '\t' && ch !== '\r') return false
  }
  return true
}

/**
 * Find the line that closes an open fence.
 * @param {string} text - full draft.
 * @param {number} from - index just past the opening fence run.
 * @param {{char: string, len: number}} open - the opening fence.
 * @returns {{lineStart: number, after: number} | null} closing line bounds, or null.
 */
function findFenceClose(text, from, open) {
  let line = text.indexOf('\n', from)
  while (line !== -1) {
    const lineStart = line + 1
    const candidate = readFence(text, lineStart)
    if (
      candidate !== null &&
      candidate.char === open.char &&
      candidate.len >= open.len &&
      blankToEol(text, candidate.after)
    ) {
      return { lineStart, after: candidate.after }
    }
    line = text.indexOf('\n', lineStart)
  }
  return null
}

/**
 * Length of the backtick run starting at `index`.
 * @param {string} text - full draft.
 * @param {number} index - index of the first backtick.
 * @returns {number} run length.
 */
function backtickRun(text, index) {
  let i = index
  while (text[i] === '`') i += 1
  return i - index
}

/**
 * Index of the backtick run of exactly `len` that closes an inline code span.
 * @param {string} text - full draft.
 * @param {number} from - index to search from.
 * @param {number} len - opening run length.
 * @returns {number} index of the closing run, or -1.
 */
function findCodeClose(text, from, len) {
  let i = from
  while (i < text.length) {
    if (text[i] === '`') {
      const run = backtickRun(text, i)
      if (run === len) return i
      i += run
      continue
    }
    i += 1
  }
  return -1
}

/**
 * Find an unescaped `$$` closing a display span.
 * @param {string} text - full draft.
 * @param {number} from - index to search from.
 * @returns {number} index of the closing `$$`, or -1.
 */
function findDoubleDollarClose(text, from) {
  let i = from
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === '$' && text[i + 1] === '$') return i
    i += 1
  }
  return -1
}

/**
 * Find the delimiter that closes a LaTeX-native span.
 * @param {string} text - full draft.
 * @param {number} from - index to search from.
 * @param {string} closer - `\\]` or `\\)`.
 * @returns {number} index of the closer, or -1.
 */
function findLatexClose(text, from, closer) {
  let i = from
  while (i < text.length) {
    if (text[i] === '\\') {
      if (text[i + 1] === closer) return i
      i += 2
      continue
    }
    i += 1
  }
  return -1
}

/**
 * Find an unescaped `$` closing an inline span.
 *
 * Mirrors the markdown rule the renderer follows: the closer may not be
 * preceded by whitespace, and a blank line ends the search so a stray `$` in
 * prose cannot swallow the rest of the message.
 * @param {string} text - full draft.
 * @param {number} from - index to search from.
 * @returns {number} index of the closing `$`, or -1.
 */
function findDollarClose(text, from) {
  let i = from
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '\n' && text[i + 1] === '\n') return -1
    if (ch === '$' && !/\s/.test(text[i - 1] ?? '')) return i
    i += 1
  }
  return -1
}

/**
 * Scan a draft for math spans.
 *
 * @param {string} text - the composer draft, byte for byte as it will be sent.
 * @returns {{spans: ReadonlyArray<object>, segments: ReadonlyArray<object>, hasMath: boolean, typesetCount: number, flaggedCount: number}} the scan.
 *   `spans` are the math occurrences in draft order; `segments` cover the whole
 *   draft as an alternating text/math run list ready for rendering.
 */
export function scanMath(text) {
  const spans = []
  const segments = []
  const unclosed = []
  const n = text.length
  let cursor = 0
  let i = 0

  /**
   * Close the pending plain-text run at `end`.
   * @param {number} end - exclusive end index.
   */
  const flush = (end) => {
    if (end > cursor) segments.push({ kind: 'text', text: text.slice(cursor, end) })
  }

  /**
   * Record one math span and close the text run before it.
   * @param {number} start - index of the opening delimiter.
   * @param {number} end - exclusive end index, past the closing delimiter.
   * @param {number} bodyStart - first index of the delimited body.
   * @param {number} bodyEnd - exclusive end of the delimited body.
   * @param {string} display - `'inline'` or `'display'`.
   * @param {string} delim - the opening delimiter, for provenance.
   */
  const emit = (start, end, bodyStart, bodyEnd, display, delim) => {
    flush(start)
    const span = {
      start,
      end,
      body: text.slice(bodyStart, bodyEnd),
      raw: text.slice(start, end),
      display,
      delim,
      typeset: TYPESET.has(delim),
      index: spans.length,
    }
    segments.push({ kind: 'math', span })
    spans.push(span)
    cursor = end
  }

  while (i < n) {
    const ch = text[i]

    // Fenced code: never math, however LaTeX-looking its contents.
    if ((i === 0 || text[i - 1] === '\n') && (ch === '`' || ch === '~')) {
      const open = readFence(text, i)
      if (open !== null) {
        const close = findFenceClose(text, open.after, open)
        if (close === null) break
        i = close.after
        continue
      }
    }

    // Inline code span.
    if (ch === '`') {
      const run = backtickRun(text, i)
      const close = findCodeClose(text, i + run, run)
      if (close === -1) {
        i += run
        continue
      }
      i = close + run
      continue
    }

    // Escapes: `\[` and `\(` open LaTeX spans, any other escape is literal.
    if (ch === '\\') {
      const next = text[i + 1]
      if (next === '[' || next === '(') {
        const display = next === '[' ? 'display' : 'inline'
        const closer = next === '[' ? ']' : ')'
        const delim = next === '[' ? DELIM.BRACKET : DELIM.PAREN
        const close = findLatexClose(text, i + 2, closer)
        if (close !== -1) {
          emit(i, close + 2, i + 2, close, display, delim)
          i = close + 2
          continue
        }
        unclosed.push({ delim, at: i, line: lineOf(text, i) })
      }
      i += 2
      continue
    }

    // Dollar delimiters.
    if (ch === '$') {
      if (text[i + 1] === '$') {
        const close = findDoubleDollarClose(text, i + 2)
        if (close !== -1) {
          emit(i, close + 2, i + 2, close, 'display', DELIM.DOUBLE_DOLLAR)
          i = close + 2
          continue
        }
        unclosed.push({ delim: DELIM.DOUBLE_DOLLAR, at: i, line: lineOf(text, i) })
        i += 2
        continue
      }
      // `$x$`: the opener must be followed by non-space, and `$5` in prose is
      // left alone by the closer rule below.
      if (!/\s/.test(text[i + 1] ?? '') && text[i + 1] !== undefined) {
        const close = findDollarClose(text, i + 1)
        if (close !== -1 && close > i + 1) {
          emit(i, close + 1, i + 1, close, 'inline', DELIM.DOLLAR)
          i = close + 1
          continue
        }
        unclosed.push({ delim: DELIM.DOLLAR, at: i, line: lineOf(text, i) })
      }
      i += 1
      continue
    }

    i += 1
  }

  flush(n)

  let typesetCount = 0
  let flaggedCount = 0
  for (const span of spans) {
    if (span.typeset) typesetCount += 1
    else flaggedCount += 1
  }

  return {
    spans,
    segments,
    unclosed,
    hasMath: spans.length > 0,
    typesetCount,
    flaggedCount,
  }
}

/**
 * One-based line number of an index, for human-readable diagnostics.
 * @param {string} text - full draft.
 * @param {number} index - character index.
 * @returns {number} the line number.
 */
function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') line += 1
  }
  return line
}

/**
 * Resolve a caret offset to the math span containing it.
 * @param {ReadonlyArray<object>} spans - spans from {@link scanMath}.
 * @param {number | null} offset - caret offset into the draft, or null.
 * @returns {object | null} the containing span, or null.
 */
export function spanAt(spans, offset) {
  if (offset === null || !Number.isFinite(offset)) return null
  for (const span of spans) {
    if (offset >= span.start && offset <= span.end) return span
  }
  return null
}

/**
 * Group draft segments into render blocks: paragraphs of flowing text, and
 * display math lifted onto its own line.
 *
 * @param {ReadonlyArray<object>} segments - segments from {@link scanMath}.
 * @returns {ReadonlyArray<object>} blocks in draft order.
 */
export function buildBlocks(segments) {
  const blocks = []
  /** @type {Array<object>} */
  let parts = []

  const closeParagraph = () => {
    if (parts.length > 0) {
      blocks.push({ kind: 'flow', parts })
      parts = []
    }
  }

  for (const segment of segments) {
    if (segment.kind === 'math') {
      if (segment.span.display === 'display') {
        closeParagraph()
        blocks.push({ kind: 'display', span: segment.span })
        continue
      }
      parts.push(segment)
      continue
    }

    // Plain text: blank lines start a new paragraph, single breaks stay inside.
    const paragraphs = segment.text.split(/\n[ \t]*\n/)
    paragraphs.forEach((paragraph, index) => {
      if (index > 0) closeParagraph()
      if (paragraph.length > 0) parts.push({ kind: 'text', text: paragraph })
    })
  }
  closeParagraph()
  return blocks
}
