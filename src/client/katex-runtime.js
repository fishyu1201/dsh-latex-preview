/**
 * KaTeX rendering for the preview.
 *
 * The render call mirrors the transcript renderer exactly — strict first, then
 * a lenient retry — so a formula that looks right in the preview cannot look
 * different once it lands in the conversation. The one divergence is the
 * failure branch: where the transcript paints a red span inline, the preview
 * reports the parse error so the user can fix it *before* sending.
 */
import katex from 'katex'
import { KATEX_CSS } from './generated/katex-css.js'

export { KATEX_CSS }

/** @type {Map<string, {html: string | null, error: string | null}>} */
const cache = new Map()

/** Bound the memo so a long session cannot grow it without limit. */
const CACHE_LIMIT = 400

/**
 * Typeset one formula.
 *
 * KaTeX's lenient mode does not throw on a bad formula — it paints a
 * `katex-error` span instead. Surfacing that marker as an error is the whole
 * point of rendering here rather than in the transcript: a formula with a typo
 * should look wrong *before* it is sent, not after.
 *
 * @param {string} source - the formula body, exactly as delimited in the draft.
 * @param {boolean} display - display style rather than inline.
 * @returns {{html: string | null, error: string | null}} markup, or the parse error.
 */
export function renderMath(source, display) {
  const key = `${display ? 'D' : 'I'}\u0000${source}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let result = null
  let strictMessage = null

  try {
    const html = katex.renderToString(source, { displayMode: display, throwOnError: true })
    result = html.includes(KATEX_ERROR_MARKER) ? null : { html, error: null }
  } catch (strictError) {
    strictMessage = strictError
  }

  if (result === null) {
    try {
      const html = katex.renderToString(source, { displayMode: display, strict: 'ignore', throwOnError: false })
      result = html.includes(KATEX_ERROR_MARKER) ? null : { html, error: null }
    } catch (lenientError) {
      strictMessage = strictMessage ?? lenientError
    }
  }

  const answer = result ?? { html: null, error: describeError(strictMessage) }

  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, answer)
  return answer
}

/** The class KaTeX uses for a formula it could not parse. */
const KATEX_ERROR_MARKER = 'katex-error'

/**
 * Turn a KaTeX throw into one short line, stripped of KaTeX's own framing.
 * @param {unknown} error - the strict-pass failure.
 * @returns {string} the message.
 */
function describeError(error) {
  const raw = error instanceof Error ? error.message : String(error)
  return (
    raw
      .replace(/^KaTeX parse error:\s*/i, '')
      .replace(/\s+at position \d+.*$/i, '')
      .replace(/\s+at end of input.*$/i, '')
      .replace(/^ParseError:\s*/i, '')
      .trim() || 'KaTeX'
  )
}
