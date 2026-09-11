/**
 * End-to-end check of the built bundle.
 *
 * The source tests cover the scanner; this one covers everything the browser
 * would do with it: load the module envelope, export the plugin face, register
 * into the composer dock and the settings section through the locale seat, and
 * render typeset markup.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` only exists inside the browser module
 * table, so this suite supplies a stub that mirrors the real implementations
 * prop for prop (see `stubs/primitives.js`). The browser run in `verify/`
 * exercises the real modules.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'
import * as primitives from './stubs/primitives.js'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'client.js'), 'utf8')

/**
 * Boot the bundle inside a jsdom realm and return its exports plus the
 * registrations and the dictionaries it handed the locale seat.
 */
function loadPlugin({ lang = 'zh', prefs = null } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html lang="${lang}"><head></head><body><div id="host"></div></body></html>`,
    // A real origin is required: jsdom refuses `localStorage` on `about:blank`.
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' },
  )
  if (prefs !== null) dom.window.localStorage.setItem('dsh-latex-preview:prefs:v1', JSON.stringify(prefs))

  let registration
  dom.window.__ModuleLoader__ = {
    load(value) {
      registration = value
    },
  }
  dom.window.eval(bundle)

  assert.ok(registration !== undefined, 'the bundle did not call __ModuleLoader__.load')
  assert.equal(registration.id, 'dsh-latex-preview')

  const requested = []
  const plugin = registration.factory((specifier) => {
    requested.push(specifier)
    if (specifier === 'react') return React
    if (specifier === 'react/jsx-runtime') return jsxRuntime
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected external module: ${specifier}`)
  })

  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual([...plugin.inject], ['slots', 'locale'])

  const slots = []
  const dictionaries = new Map()
  const locale = {
    register: (ns, dicts) => {
      dictionaries.set(ns, dicts)
      return () => {}
    },
    // Stands in for the shell's bound translate: same `(key, params)` shape.
    bind: (ns) => (key, params) => {
      const template = dictionaries.get(ns)?.[lang]?.[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    },
  }
  const service = {
    inject: (name, contribute) => {
      contribute()
    },
    register: (meta, component) => {
      slots.push({ meta, component })
      return () => {}
    },
  }
  const ctx = {
    effect: (fn) => {
      fn()
    },
    get: (name) => (name === 'slots' ? service : name === 'locale' ? locale : undefined),
    locale,
  }
  plugin.apply(ctx)
  return { slots, window: dom.window, requested, dictionaries, t: locale.bind('latex-preview') }
}

/** Render the dock for a draft. */
function renderDock({ draft, lang = 'zh', prefs = null }) {
  const { slots, t } = loadPlugin({ lang, prefs })
  const dock = slots.find((entry) => entry.meta.name === 'conversation.input.dock')
  assert.ok(dock !== undefined, 'the dock was not registered')
  return renderToStaticMarkup(
    React.createElement(dock.component, {
      sessionId: 'session-test',
      session: {},
      input: { draft },
      inputActions: {},
      // The standard session-scoped selector hook.
      useInput: (select) => select({ draft }),
      t,
      primitives,
    }),
  )
}

test('requests only modules the shell serves', () => {
  const { requested } = loadPlugin()
  assert.deepEqual([...new Set(requested)].sort(), [
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
    'react/jsx-runtime',
  ])
  // The declarations in package.json must name exactly the same set.
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
  assert.deepEqual([...pkg.dsh.client.external].sort(), [...new Set(requested)].sort())
})

test('registers both dictionaries on the locale seat', () => {
  const { dictionaries } = loadPlugin()
  const dicts = dictionaries.get('latex-preview')
  assert.ok(dicts !== undefined, 'no dictionaries were registered')
  assert.deepEqual(Object.keys(dicts).sort(), ['en', 'zh'])
  // Bilingual balance: the locale registry rejects an unbalanced pair, so the
  // two dictionaries must carry identical key sets.
  assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort())
})

test('registers the dock and the settings section on the locale seat', () => {
  const { slots } = loadPlugin()
  const owned = slots.filter((entry) => entry.meta.id === 'latex-preview')
  assert.deepEqual(
    owned.map((entry) => [entry.meta.name, entry.meta.locale]),
    [
      ['conversation.input.dock', 'latex-preview'],
      ['settings.section', 'latex-preview'],
    ],
  )
})

test('takes over the user and steering chat nodes', () => {
  const { slots } = loadPlugin()
  const nodes = slots.filter((entry) => entry.meta.name === 'conversation.chat.node')
  assert.deepEqual(
    nodes.map((entry) => [entry.meta.key, entry.meta.locale]),
    [
      ['user', 'latex-preview'],
      ['steering', 'latex-preview'],
    ],
  )
})

test('typesets math in a sent message and keeps the source for the copy action', () => {
  const { slots, t } = loadPlugin()
  const view = slots.find((entry) => entry.meta.key === 'user')
  const content = [{ type: 'text', text: '公式测试 $E = mc^2$ 结束' }]
  const html = renderToStaticMarkup(
    React.createElement(view.component, {
      node: { kind: 'user', data: { content, time: Date.parse('2026-09-11T10:22:00') } },
      renderMessageImages: () => null,
      t,
      primitives,
    }),
  )
  assert.match(html, /class="katex"/, 'the sent formula must be typeset')
  assert.doesNotMatch(html, /\$E = mc\^2\$/, 'the raw source must not be shown')
  assert.match(html, /lp-bubble/)
  assert.match(html, /aria-label="复制"/)
  // The message-level copy action still hands over the source.
  assert.match(html, /公式测试/)
})

test('the message copy action hands over the source, not the rendered text', async () => {
  const { slots, t, window: win } = loadPlugin()
  const view = slots.find((entry) => entry.meta.key === 'user')
  const source = '公式测试 $E = mc^2$ 结束'

  // `react-dom/client` needs a document at call time, so the globals are set
  // before it is imported and the tree is rendered for real.
  globalThis.window = win
  globalThis.document = win.document
  globalThis.Node = win.Node
  globalThis.MouseEvent = win.MouseEvent
  const { createRoot } = await import('react-dom/client')

  const container = win.document.createElement('div')
  win.document.body.append(container)
  const root = createRoot(container)
  root.render(
    React.createElement(view.component, {
      node: { kind: 'user', data: { content: [{ type: 'text', text: source }] } },
      renderMessageImages: () => null,
      t,
      primitives,
    }),
  )
  await new Promise((resolve) => setTimeout(resolve, 30))

  const button = container.querySelector('.lp-action')
  assert.ok(button !== null, 'the copy action must render')
  globalThis.__lpCopied = null
  button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.equal(globalThis.__lpCopied, source, 'copy must yield the LaTeX source verbatim')
  root.unmount()
  container.remove()
})

test('leaves a sent message without math exactly as the shell projects it', () => {
  const { slots, t } = loadPlugin()
  const view = slots.find((entry) => entry.meta.key === 'user')
  const html = renderToStaticMarkup(
    React.createElement(view.component, {
      node: { kind: 'user', data: { content: [{ type: 'text', text: 'plain words only' }] } },
      renderMessageImages: () => null,
      t,
      primitives,
    }),
  )
  assert.match(html, /plain words only/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('renders the user bubble through the shell projection, chips included', () => {
  const { slots, t } = loadPlugin()
  const view = slots.find((entry) => entry.meta.key === 'user')
  const html = renderToStaticMarkup(
    React.createElement(view.component, {
      node: {
        kind: 'user',
        data: {
          content: [{ type: 'text', text: 'see @notes and $x^2$' }],
          referenceLabels: ['notes'],
        },
      },
      renderMessageImages: () => null,
      t,
      primitives,
    }),
  )
  assert.match(html, /data-ref-chip/, 'the reference chip must survive')
  assert.match(html, /class="katex"/, 'and the math beside it must still typeset')
  assert.match(html, /lp-ref-summary/)
})

test('contributes nothing to an empty composer', () => {
  assert.equal(renderDock({ draft: '' }), '')
  assert.equal(renderDock({ draft: '   \n  ' }), '')
})

test('contributes nothing when the draft holds no math', () => {
  assert.equal(renderDock({ draft: 'just a plain sentence' }), '')
})

test('typesets inline math and reports the count', () => {
  const html = renderDock({ draft: 'area is $\\pi r^2$ exactly' })
  assert.match(html, /class="lp-root/)
  assert.match(html, /class="katex"/)
  assert.match(html, /1 个公式/)
  assert.match(html, /发送 LaTeX 原文/)
  assert.match(html, /area is/)
  assert.match(html, /exactly/)
})

test('uses the shared controls rather than local copies', () => {
  const html = renderDock({ draft: 'area is $\\pi r^2$' })
  assert.match(html, /lp-stub-tag/, 'the head chips must be ui-primitives Tag')
  assert.match(html, /lp-stub-button/, 'the collapse control must be ui-primitives Button')
  assert.match(html, /data-tooltip=/, 'hints must ride ui-primitives Tooltip')
  // No hand-rolled switches or segmented controls survive in the preview.
  assert.doesNotMatch(html, /lp-switch|lp-seg-btn/)
})

test('lifts display math onto its own block', () => {
  const html = renderDock({ draft: 'before\n\n$$\\int_0^1 x\\,dx$$\n\nafter' })
  assert.match(html, /class="lp-display"/)
})

test('counts several formulas', () => {
  const html = renderDock({ draft: '$a$ and $b$ and $c$' })
  assert.match(html, /3 个公式/)
})

test('surfaces a syntax error without breaking the panel', () => {
  const html = renderDock({ draft: 'broken $\\frac{1}{$ here' })
  assert.match(html, /data-tone="danger"/)
  assert.match(html, /无法排版|1 个公式无法排版/)
  assert.match(html, /lp-broken/)
})

test('flags LaTeX-native delimiters that the transcript will not typeset', () => {
  const html = renderDock({ draft: '\\[x^2\\]' })
  assert.match(html, /data-tone="warning"/)
  assert.match(html, /lp-flagged/)
})

test('reports an unclosed delimiter with its line', () => {
  const html = renderDock({ draft: 'intro\nnow $x + y\nmore' })
  assert.match(html, /未闭合/)
  assert.match(html, /第 2 行/)
})

test('renders the collapsed strip instead of the panel', () => {
  const html = renderDock({
    draft: 'area is $\\pi r^2$',
    prefs: { enabled: true, bench: true, collapsed: true, maxHeight: 280 },
  })
  assert.match(html, /class="lp-strip"/)
  assert.match(html, /预览已收起/)
  assert.doesNotMatch(html, /lp-card/)
})

test('renders nothing at all when the plugin is switched off', () => {
  const html = renderDock({
    draft: 'area is $\\pi r^2$',
    prefs: { enabled: false, bench: false, collapsed: false, maxHeight: 280 },
  })
  assert.equal(html, '')
})

test('carries the configured maximum height as a custom property', () => {
  const html = renderDock({
    draft: '$x$',
    prefs: { enabled: true, bench: true, collapsed: false, maxHeight: 400 },
  })
  assert.match(html, /--lp-max-height:400px/)
})

test('settings section renders the shared Switch and Button controls', () => {
  const { slots, t } = loadPlugin()
  const section = slots.find((entry) => entry.meta.name === 'settings.section')
  const html = renderToStaticMarkup(
    React.createElement(section.component, { t, primitives }),
  )
  assert.equal((html.match(/role="switch"/g) ?? []).length, 4, 'four switches')
  assert.match(html, /lp-stub-button/, 'the height choices are ui-primitives Buttons')
  assert.match(html, /lp-set-choices/)
  assert.doesNotMatch(html, /lp-switch|lp-seg/)
})

test('renders English copy under an English shell', () => {
  const html = renderDock({ draft: '$x$', lang: 'en' })
  assert.match(html, /sends raw LaTeX/)
  assert.match(html, /1 formula/)
})
