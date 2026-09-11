/**
 * Caret tracking for the composer.
 *
 * The input contract exposes the draft but not the caret, so the dock reads the
 * caret back out of the Lexical contenteditable: a Range from the block start to
 * the caret yields its text directly, and `<br>` soft breaks are counted
 * explicitly because Range text omits them.
 *
 * Everything here is best-effort by design. A caret that cannot be resolved
 * costs the focus bench, never the preview.
 */

/** How far up the tree to look for the composer's editor. */
const ANCESTOR_DEPTH = 8

/**
 * Selectors for the composer's editable root, most specific first.
 *
 * Lexical stamps `data-lexical-editor` on the root only once it is attached, and
 * the harness's own `data-composer-input` is present from first paint — so the
 * harness attribute leads and Lexical's is the fallback.
 */
const EDITOR_SELECTORS = ['[data-composer-input]', '[data-lexical-editor="true"]']

/**
 * Whether an element has layout.
 * @param {Element} el - candidate element.
 * @returns {boolean} true when it is rendered.
 */
function isVisible(el) {
  return el.getClientRects().length > 0
}

/**
 * Locate the composer's editable root.
 * @param {Element | null} anchor - an element known to sit beside the composer.
 * @returns {HTMLElement | null} the contenteditable root, or null.
 */
export function locateEditor(anchor) {
  let node = anchor
  for (let depth = 0; node !== null && depth < ANCESTOR_DEPTH; depth += 1) {
    if (typeof node.querySelector === 'function') {
      for (const selector of EDITOR_SELECTORS) {
        const found = node.querySelector(selector)
        if (found !== null && isVisible(found)) return found
      }
    }
    node = node.parentElement
  }
  // Fallback: the composer is the lowest editor on the page.
  for (const selector of EDITOR_SELECTORS) {
    const all = document.querySelectorAll(selector)
    for (let i = all.length - 1; i >= 0; i -= 1) {
      if (isVisible(all[i])) return all[i]
    }
  }
  return null
}

/**
 * Rendered length of one editor block, with empty-paragraph `<br>` padding
 * normalized away so the DOM length matches the draft length.
 * @param {Element} block - one direct child of the editor root.
 * @returns {number} length in draft characters.
 */
function blockLength(block) {
  const kids = block.childNodes
  if (kids.length === 1 && kids[0].nodeName === 'BR') return 0
  let total = 0
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let current = walker.nextNode()
  while (current !== null) {
    if (current.nodeType === Node.TEXT_NODE) total += current.data.length
    else if (current.nodeName === 'BR') total += 1
    current = walker.nextNode()
  }
  return total
}

/**
 * Offset of one DOM point inside its block, in draft characters.
 * @param {Element} block - the containing block.
 * @param {Node} container - the point's container node.
 * @param {number} offset - the point's offset within its container.
 * @returns {number | null} the offset within the block, or null when the point is outside.
 */
function offsetInBlock(block, container, offset) {
  if (!block.contains(container)) return null
  if (container === block) {
    // An element-anchored point: sum the blocks' children before `offset`.
    let total = 0
    const kids = block.childNodes
    for (let i = 0; i < Math.min(offset, kids.length); i += 1) {
      const child = kids[i]
      if (child.nodeType === Node.TEXT_NODE) total += child.data.length
      else if (child.nodeName === 'BR') total += 1
      else total += blockLength(child)
    }
    return total
  }

  let total = 0
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let current = walker.nextNode()
  while (current !== null) {
    if (current === container) {
      if (current.nodeType === Node.TEXT_NODE) return total + offset
      return total
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.contains(container)) return total + offset
      total += current.data.length
    } else if (current.nodeName === 'BR') {
      total += 1
    }
    current = walker.nextNode()
  }
  return null
}

/**
 * Resolve the live caret to an offset into the draft.
 * @param {HTMLElement | null} editor - the editor root from {@link locateEditor}.
 * @returns {number | null} the caret offset, or null when the caret is elsewhere.
 */
export function caretOffset(editor) {
  if (editor === null) return null
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return null

  const blocks = Array.from(editor.children)
  let total = 0
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const length = blockLength(block)
    if (index > 0) total += 1
    const inside = offsetInBlock(block, range.startContainer, range.startOffset)
    if (inside !== null) return total + Math.min(inside, length)
    total += length
  }
  return null
}

/**
 * Subscribe to caret movement.
 * @param {() => void} onChange - called at most once per animation frame while the caret moves.
 * @returns {() => void} unsubscribe.
 */
export function observeCaret(onChange) {
  let frame = 0
  const schedule = () => {
    if (frame !== 0) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      onChange()
    })
  }
  document.addEventListener('selectionchange', schedule)
  return () => {
    document.removeEventListener('selectionchange', schedule)
    if (frame !== 0) window.cancelAnimationFrame(frame)
  }
}
