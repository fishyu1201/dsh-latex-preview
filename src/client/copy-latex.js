/**
 * Copy-to-LaTeX for rendered formulas.
 *
 * KaTeX emits two faces: an accessible MathML tree whose `<annotation>` holds the
 * original TeX, and an `aria-hidden` HTML tree of positioned glyphs. Selecting
 * across them makes the browser concatenate both, which is why copying a formula
 * out of the transcript produces doubled, reordered noise.
 *
 * The fix is a `copy` listener that acts only when the selection actually
 * contains a formula. It first snaps the selection's boundaries out to whole
 * formulas — so selecting part of one, or dragging from a formula into the text
 * after it, still yields complete source — then rebuilds the text with every
 * `.katex` subtree replaced by its TeX annotation. Prose, code blocks and
 * selections with no math at all are left to the browser untouched.
 */
/** The annotation KaTeX writes the original TeX into. */
const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]'

/**
 * TeX source for one rendered formula, or null when the node carries none.
 * @param {Element} katex - a `.katex` element inside a cloned range.
 * @returns {string | null} the source.
 */
function texOf(katex) {
  const annotation = katex.querySelector(TEX_ANNOTATION)
  if (annotation !== null && annotation.textContent !== null) return annotation.textContent
  return null
}

/**
 * Rebuild one cloned range as plain text with formulas restored to source.
 *
 * Exported so the serialization can be exercised without a clipboard: jsdom
 * implements `Range` but not `ClipboardEvent` with a data store.
 *
 * @param {Range} range - the live selection range.
 * @returns {{text: string, formulas: number}} the serialized text and how many formulas it restored.
 */
export function serialize(range) {
  const fragment = range.cloneContents()
  let formulas = 0

  for (const katex of Array.from(fragment.querySelectorAll('.katex'))) {
    const tex = texOf(katex)
    // Only reachable if a caller bypasses `expandToFormulas`; the glyphs are
    // left alone rather than inventing source the user never wrote.
    if (tex === null) continue
    const display = katex.closest('.katex-display') !== null
    katex.replaceWith(fragment.ownerDocument.createTextNode(display ? `\n$$${tex}$$\n` : `$${tex}$`))
    formulas += 1
  }

  return { text: fragment.textContent ?? '', formulas }
}

/**
 * The formula element enclosing one boundary node, if any.
 * @param {Node} node - a range boundary container.
 * @returns {Element | null} the `.katex` ancestor, or null.
 */
function enclosingFormula(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  return element === null || element === undefined ? null : element.closest('.katex')
}

/**
 * Grow a working range so every formula it touches is included whole.
 *
 * This is what makes "select part of a formula" work. `cloneContents()` only
 * clones an element when the range's boundary sits outside it; a selection that
 * starts or ends *inside* a formula arrives as a fragment of KaTeX's inner HTML
 * with no `.katex` to recognise — so the formula is either missed entirely or
 * leaks a few of its glyphs. Snapping both boundaries out to the enclosing
 * formula makes the element whole again, which is also the only useful answer:
 * half a formula has no meaning as LaTeX.
 *
 * @param {Range} range - a working copy, never the live selection.
 * @returns {boolean} whether anything was expanded.
 */
function expandToFormulas(range) {
  let expanded = false
  const start = enclosingFormula(range.startContainer)
  if (start !== null) {
    // The display wrapper belongs to the formula: dropping it would downgrade
    // `$$…$$` to `$…$` on the way out.
    range.setStartBefore(start.closest('.katex-display') ?? start)
    expanded = true
  }
  const end = enclosingFormula(range.endContainer)
  if (end !== null) {
    range.setEndAfter(end.closest('.katex-display') ?? end)
    expanded = true
  }
  return expanded
}

/**
 * Install the copy interceptor.
 * @param {() => boolean} isEnabled - read live, so the settings switch applies without a reload.
 * @returns {() => void} uninstall.
 */
export function installCopyLatex(isEnabled) {
  /**
   * @param {ClipboardEvent} event - the document copy event.
   */
  const onCopy = (event) => {
    if (!isEnabled()) return
    if (event.clipboardData === null) return
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return

    // All the work happens on a copy: expanding boundaries must not move the
    // user's visible selection, and bailing out must leave it alone entirely.
    const working = selection.getRangeAt(0).cloneRange()
    try {
      expandToFormulas(working)
    } catch {
      // A boundary outside the document cannot be snapped; fall through and let
      // the serializer decide on the range as it stands.
    }

    const { text, formulas } = serialize(working)
    if (formulas === 0) return

    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }

  document.addEventListener('copy', onCopy, true)
  return () => document.removeEventListener('copy', onCopy, true)
}
