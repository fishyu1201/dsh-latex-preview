/**
 * Copy-as-LaTeX.
 *
 * jsdom implements `Range` but not `ClipboardEvent` with a data store, so the
 * serializer is exercised directly on real cloned ranges; the shipped listener
 * is a thin wrapper around exactly this function.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:3080/' })
globalThis.Node = dom.window.Node
globalThis.document = dom.window.document
globalThis.window = dom.window

const { serialize } = await import('../src/client/copy-latex.js')

/**
 * The interceptor's own boundary snapping. `serialize` is handed a range that is
 * already whole-formula aligned, so the snapping is exercised here through the
 * installed listener — which is also what proves the live selection is left
 * untouched when there is nothing to do.
 */
const { installCopyLatex } = await import('../src/client/copy-latex.js')

/** Fire a copy for one selection and report what the handler did with it. */
function fireCopy(range, enabled = true) {
  const selection = dom.window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  const event = new dom.window.Event('copy', { bubbles: true, cancelable: true })
  const store = new Map()
  event.clipboardData = { setData: (type, value) => store.set(type, value) }
  const from = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement
  document.dispatchEvent(event)
  return { handled: event.defaultPrevented, plain: store.get('text/plain'), enabled }
}

/** First non-blank text node inside an element. */
function innerText(el) {
  const walker = document.createTreeWalker(el, dom.window.NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node !== null && (node.data ?? '').trim() === '') node = walker.nextNode()
  return node
}

let uninstall = null
test.before(() => {
  uninstall = installCopyLatex(() => true)
})
test.after(() => uninstall?.())

/**
 * KaTeX's own markup shape, trimmed to what the serializer reads. The real
 * `renderToString` output carries no pretty-printing whitespace, so the fixture
 * must not either — a stray newline here would be the fixture's, not the code's.
 */
const inlineKatex = (tex) =>
  `<span class="katex"><span class="katex-mathml"><math><semantics>` +
  `<annotation encoding="application/x-tex">${tex}</annotation>` +
  `</semantics></math></span><span class="katex-html" aria-hidden="true">` +
  `<span class="mord">${tex}</span></span></span>`

const displayKatex = (tex) => `<span class="katex-display">${inlineKatex(tex)}</span>`

/** Select a node and serialize it. */
function serializeNode(node) {
  const range = document.createRange()
  range.selectNode(node)
  return serialize(range)
}

test('a formula copies as its TeX source, not its glyphs', () => {
  document.body.innerHTML = `<p>before ${inlineKatex('E = mc^2')} after</p>`
  const paragraph = document.querySelector('p')
  const result = serializeNode(paragraph)
  assert.equal(result.formulas, 1)
  assert.equal(result.text, 'before $E = mc^2$ after')
  // The rendered glyphs and the MathML both came along for the ride before.
  assert.doesNotMatch(result.text, /katex/)
})

test('display math keeps its $$ delimiters on their own lines', () => {
  document.body.innerHTML = `${displayKatex('\\int_0^1 x\\,dx')}`
  const result = serializeNode(document.querySelector('.katex-display'))
  assert.equal(result.formulas, 1)
  assert.match(result.text, /\$\$\\int_0\^1 x\\,dx\$\$/)
})

test('several formulas in one selection all come back as source', () => {
  document.body.innerHTML = `<p>${inlineKatex('a')} and ${inlineKatex('b')} and ${inlineKatex('\\frac{1}{2}')}</p>`
  const result = serializeNode(document.querySelector('p'))
  assert.equal(result.formulas, 3)
  assert.equal(result.text, '$a$ and $b$ and $\\frac{1}{2}$')
})

test('a selection with no formula is left alone', () => {
  document.body.innerHTML = '<p>plain prose only</p>'
  const result = serializeNode(document.querySelector('p'))
  assert.equal(result.formulas, 0)
  assert.equal(result.text, 'plain prose only')
})

test('a formula without an annotation keeps its glyphs rather than inventing source', () => {
  document.body.innerHTML = '<p><span class="katex"><span class="katex-html">x2</span></span></p>'
  const result = serializeNode(document.querySelector('p'))
  assert.equal(result.formulas, 0)
  assert.equal(result.text, 'x2')
})

test('partial text selection around a formula still serializes', () => {
  document.body.innerHTML = `<p>keep ${inlineKatex('y')} drop</p>`
  const text = document.querySelector('p').firstChild
  const range = document.createRange()
  range.setStart(text, 0)
  range.setEnd(text, 5)
  const result = serialize(range)
  assert.equal(result.text, 'keep ')
  assert.equal(result.formulas, 0)
})

// ---- the cases that made "copy one formula" fail -------------------------

test('selecting only part of a formula still copies the whole formula', () => {
  document.body.innerHTML = `<p>before ${inlineKatex('a+b')} after</p>`
  const node = innerText(document.querySelector('.katex'))
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, 1)
  const result = fireCopy(range)
  assert.equal(result.handled, true, 'a selection inside a formula must be handled')
  assert.equal(result.plain, '$a+b$', 'half a formula has no LaTeX; the whole one is the answer')
})

test('dragging from a formula into the next one does not leak glyphs', () => {
  document.body.innerHTML = `<p>${inlineKatex('a+b')} mid ${inlineKatex('c+d')} tail</p>`
  const formulas = document.querySelectorAll('.katex')
  const range = document.createRange()
  range.setStart(innerText(formulas[0]), 0)
  range.setEnd(innerText(formulas[1]), 1)
  const result = fireCopy(range)
  assert.equal(result.handled, true)
  assert.equal(result.plain, '$a+b$ mid $c+d$', 'both formulas must come back whole')
})

test('a display formula selected from inside keeps its $$ delimiters', () => {
  document.body.innerHTML = `<p>${displayKatex('\\int_0^1 x\\,dx')}</p>`
  const node = innerText(document.querySelector('.katex'))
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, 1)
  const result = fireCopy(range)
  assert.equal(result.handled, true)
  assert.match(result.plain, /^\s*\$\$\\int_0\^1 x\\,dx\$\$\s*$/)
})

test('a selection with no formula is left to the browser', () => {
  document.body.innerHTML = '<p>plain prose only</p>'
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('p'))
  const result = fireCopy(range)
  assert.equal(result.handled, false, 'no formula means no interception')
  assert.equal(result.plain, undefined)
})

test('the live selection is not moved by a copy that bails out', () => {
  document.body.innerHTML = '<p>plain prose only</p>'
  const paragraph = document.querySelector('p')
  const range = document.createRange()
  range.setStart(paragraph.firstChild, 2)
  range.setEnd(paragraph.firstChild, 7)
  const selection = dom.window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  fireCopy(range)
  const after = selection.getRangeAt(0)
  assert.equal(after.startOffset, 2, 'the user selection must survive an untouched copy')
  assert.equal(after.endOffset, 7)
})

test('a copy in a message with math does not expand the visible selection', () => {
  document.body.innerHTML = `<p>before ${inlineKatex('a+b')} after</p>`
  const node = innerText(document.querySelector('.katex'))
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, 1)
  fireCopy(range)
  const after = dom.window.getSelection().getRangeAt(0)
  assert.equal(after.startContainer, node, 'boundary snapping happens on a copy, not on screen')
  assert.equal(after.startOffset, 0)
  assert.equal(after.endOffset, 1)
})
