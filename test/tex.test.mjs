import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBlocks, scanMath, spanAt } from '../src/client/tex.js'

/** Collect the bodies of every math span, for terse assertions. */
const bodies = (text) => scanMath(text).spans.map((span) => span.body)

test('finds inline and display spans', () => {
  assert.deepEqual(bodies('area is $\\pi r^2$ ok'), ['\\pi r^2'])
  assert.deepEqual(bodies('$$\\int_0^1 x\\,dx$$'), ['\\int_0^1 x\\,dx'])
  assert.deepEqual(bodies('$a$ and $b$'), ['a', 'b'])
})

test('classifies display versus inline', () => {
  const [inline] = scanMath('$x$').spans
  const [display] = scanMath('$$x$$').spans
  assert.equal(inline.display, 'inline')
  assert.equal(display.display, 'display')
})

test('records the exact raw slice, delimiters included', () => {
  const text = 'so $E = mc^2$ holds'
  const [span] = scanMath(text).spans
  assert.equal(span.raw, '$E = mc^2$')
  assert.equal(text.slice(span.start, span.end), span.raw)
})

test('recognises LaTeX-native delimiters and flags them as non-typesetting', () => {
  const scan = scanMath('\\[x^2\\] and \\(y\\)')
  assert.deepEqual(
    scan.spans.map((span) => [span.body, span.display, span.typeset]),
    [
      ['x^2', 'display', false],
      ['y', 'inline', false],
    ],
  )
  assert.equal(scan.typesetCount, 0)
  assert.equal(scan.flaggedCount, 2)
})

test('counts only markdown-legal delimiters as typesetting', () => {
  const scan = scanMath('$a$ $$b$$ \\(c\\)')
  assert.equal(scan.typesetCount, 2)
  assert.equal(scan.flaggedCount, 1)
})

test('never treats fenced code as math', () => {
  const text = 'before\n```sh\necho "$HOME" and $$x$$\n```\nafter $y$'
  assert.deepEqual(bodies(text), ['y'])
})

test('closes a fence on a longer run of the same marker', () => {
  const text = '````\n$$x$$\n````\n$y$'
  assert.deepEqual(bodies(text), ['y'])
})

test('never treats an inline code span as math', () => {
  assert.deepEqual(bodies('use `$PATH` then $x$'), ['x'])
  assert.deepEqual(bodies('``a $b$ c`` $d$'), ['d'])
})

test('respects escaped delimiters', () => {
  assert.deepEqual(bodies('costs \\$5 and \\$6'), [])
  assert.deepEqual(bodies('\\$x$ $y$'), ['y'])
})

test('leaves a lone dollar in prose alone', () => {
  assert.deepEqual(bodies('it costs $5 today'), [])
})

test('rejects an opener followed by whitespace', () => {
  assert.deepEqual(bodies('a $ b $ c'), [])
})

test('stops an inline span at a blank line', () => {
  const scan = scanMath('$x\n\nstill open')
  assert.deepEqual(scan.spans, [])
  assert.equal(scan.unclosed.length, 1)
  assert.equal(scan.unclosed[0].delim, '$')
})

test('reports unclosed delimiters with a one-based line', () => {
  const scan = scanMath('line one\nline two $x + y\nline three')
  assert.equal(scan.unclosed.length, 1)
  assert.equal(scan.unclosed[0].line, 2)
  assert.equal(scan.unclosed[0].delim, '$')
})

test('reports an unclosed display delimiter', () => {
  const scan = scanMath('text $$a + b')
  assert.equal(scan.unclosed.length, 1)
  assert.equal(scan.unclosed[0].delim, '$$')
})

test('an unterminated fence swallows the rest without reporting math', () => {
  const scan = scanMath('```\n$x$\n')
  assert.deepEqual(scan.spans, [])
  assert.deepEqual(scan.unclosed, [])
})

test('segments cover the draft exactly once, in order', () => {
  const text = 'lead $a$ mid $$b$$ tail'
  const segments = scanMath(text).segments
  const rebuilt = segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.span.raw)).join('')
  assert.equal(rebuilt, text)
})

test('segments cover a draft with no math at all', () => {
  const segments = scanMath('just prose').segments
  assert.deepEqual(segments, [{ kind: 'text', text: 'just prose' }])
})

test('spanAt resolves a caret inside, on the edge, and outside', () => {
  const [span] = scanMath('a $x$ b').spans
  assert.equal(spanAt([span], span.start), span)
  assert.equal(spanAt([span], span.start + 2), span)
  assert.equal(spanAt([span], span.end), span)
  assert.equal(spanAt([span], span.end + 1), null)
  assert.equal(spanAt([span], null), null)
})

test('buildBlocks lifts display math onto its own block', () => {
  const blocks = buildBlocks(scanMath('before $$x$$ after').segments)
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['flow', 'display', 'flow'],
  )
})

test('buildBlocks splits paragraphs on blank lines and keeps soft breaks', () => {
  const blocks = buildBlocks(scanMath('one\ntwo\n\nthree').segments)
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['flow', 'flow'],
  )
  assert.equal(blocks[0].parts[0].text, 'one\ntwo')
  assert.equal(blocks[1].parts[0].text, 'three')
})

test('buildBlocks keeps inline math inside its paragraph', () => {
  const blocks = buildBlocks(scanMath('let $a$ be given').segments)
  assert.equal(blocks.length, 1)
  assert.deepEqual(
    blocks[0].parts.map((part) => part.kind),
    ['text', 'math', 'text'],
  )
})

test('survives a pathological draft without hanging', () => {
  const text = `${'$'.repeat(400)}${'\\'.repeat(200)}${'`'.repeat(120)}`
  const scan = scanMath(text)
  assert.ok(scan.spans.length >= 0)
})

test('handles a multi-line display block', () => {
  const text = '$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$'
  assert.deepEqual(bodies(text), ['\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n'])
})
