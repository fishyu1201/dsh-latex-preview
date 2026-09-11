/**
 * End-to-end verification against a real `dsh web`.
 *
 * Boots the shell in headless Chrome, opens a session, types LaTeX into the
 * composer, and checks what the preview does with it — including that the draft
 * the model would receive is untouched, that the caret bench follows the caret,
 * that a malformed formula is caught before sending, and that the settings
 * section mounts.
 *
 * Usage: node verify/drive.mjs <tokenised-url>
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchChrome, root, sleep } from './cdp.mjs'

const url = process.argv[2]
if (url === undefined) {
  console.error('usage: node verify/drive.mjs <tokenised-url>')
  process.exit(2)
}

// Ends inside a valid formula, so the caret bench has something to show.
const VALID_DRAFT =
  '设损失为 $L(\\theta) = \\frac{1}{n}\\sum_{i=1}^{n}(y_i - f_\\theta(x_i))^2$，则\n\n$$\\nabla_\\theta L = \\frac{2}{n}\\sum_{i=1}^{n}\\bigl(f_\\theta(x_i) - y_i\\bigr)\\nabla_\\theta f_\\theta(x_i)$$\n\n再用 `$PATH` 检查环境，最后回到 $\\alpha + \\beta$'
const BROKEN_TAIL = ' 以及 $\\frac{1}{$'
// Sent as a real message, so the transcript renderer can be checked.
const SENT_DRAFT = '已发送公式 $E = mc^2$ 与行间 $$\\int_0^1 x\\,dx = \\frac{1}{2}$$'

const report = { steps: [], failures: [] }
const step = (name, detail) => {
  report.steps.push({ name, detail })
  console.log(`[verify] ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)
}
const fail = (message) => {
  report.failures.push(message)
  console.log(`[verify]   ✗ ${message}`)
}

/** Screenshot the dock region at 2x. */
async function shoot(page, name, rect) {
  if (rect == null) return null
  const clip = {
    x: Math.max(0, rect.x - 14),
    y: Math.max(0, rect.y - 14),
    width: Math.min(rect.width + 28, 1400),
    height: Math.min(rect.height + 28, 900),
    scale: 2,
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip })
  const path = join(root, 'verify', `${name}.png`)
  writeFileSync(path, Buffer.from(shot.data, 'base64'))
  return `verify/${name}.png`
}

/**
 * Put text into the composer. Focus is set through the DOM rather than a
 * synthetic click, because a synthetic click on the editor re-runs the shell's
 * popup-dismiss path and can drop the insertion.
 */
async function typeInto(page, text) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.eval(`(() => {
      const el = document.querySelector('[data-lexical-editor="true"]')
      el.focus()
      return document.activeElement === el || el.contains(document.activeElement)
    })()`)
    await sleep(250)
    await page.send('Input.insertText', { text })
    await sleep(1100)
    const landed = await page.eval(`(() => {
      const el = document.querySelector('[data-lexical-editor="true"]')
      return ((el.innerText || el.textContent) || '').length
    })()`)
    if (landed > 0) return landed
    await sleep(1500)
  }
  return 0
}

/**
 * Hover an element and read the shell's tooltip bubble back out of the DOM.
 * The real `Tooltip` clones its child, attaches pointer handlers, and renders a
 * `role="tooltip"` span while hovered — so hovering is the only honest proof it
 * is wired in.
 */
async function hoverTooltip(page, selector) {
  const point = await page.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (point === null) return null
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 })
  await sleep(400)
  return page.eval(`document.querySelector('[role="tooltip"]')?.textContent ?? null`)
}

const { page, kill } = await launchChrome(9334)

try {
  await page.send('Page.navigate', { url })
  await page.waitFor('window.__DSH_BOOT__ !== undefined', 'the boot graph')
  await page.waitFor(
    'document.querySelector("style[data-plugin-css=\\"dsh-latex-preview\\"]") !== null',
    'the plugin stylesheet',
  )
  step('plugin-mounted', { ok: true })

  const graph = await page.eval(`(() => {
    const entries = (window.__DSH_BOOT__?.entries ?? []).map((e) => e.id)
    return { inGraph: entries.includes('dsh-latex-preview'), total: entries.length }
  })()`)
  step('client-module-graph', graph)
  if (!graph.inGraph) fail('the plugin is missing from the client module graph')

  // A fresh DSH home opens up to two modals in sequence — the beta notice, then
  // the API-key dialog. Both trap focus, and the composer paints behind them, so
  // every one has to be cleared before anything can be typed.
  const dismissed = []
  for (let round = 0; round < 5; round += 1) {
    await sleep(1500)
    const open = await page.eval(
      `document.querySelector('[role="dialog"][aria-modal="true"]') !== null`,
    )
    if (!open) break
    const label = await page.clickButton(/稍后配置|Configure later|继续|Continue|关闭|Close|Got it/)
    dismissed.push(label)
    if (label === null) break
  }
  step('modals-dismissed', { dismissed })
  await page.waitFor(
    'document.querySelector(\'[role="dialog"][aria-modal="true"]\') === null',
    'the modals to close',
    60,
  )
  await page.waitFor('document.querySelector(\'[data-lexical-editor="true"]\') !== null', 'the composer', 120)
  step('composer-present', { ok: true })

  // ---- type a draft that ends inside a valid formula ----
  await sleep(1200)
  const landed = await typeInto(page, VALID_DRAFT)
  step('draft-typed', { length: landed })
  if (landed === 0) fail('the composer never accepted the typed draft')

  const bench = await page.eval(`(() => {
    const dock = document.querySelector('.lp-root')
    const editor = document.querySelector('[data-lexical-editor="true"]')
    const active = dock?.querySelector('.lp-tag-active')
    const stage = dock?.querySelector('.lp-bench-stage')
    const rect = dock?.getBoundingClientRect()
    return {
      present: dock !== null,
      katex: dock?.querySelectorAll('.katex').length ?? 0,
      displayBlocks: dock?.querySelectorAll('.lp-display').length ?? 0,
      bench: stage !== null && stage !== undefined,
      benchRendered: stage ? stage.querySelectorAll('.katex').length : 0,
      benchSource: dock?.querySelector('.lp-bench-src')?.textContent ?? null,
      benchStatus: dock?.querySelector('.lp-bench-ok')?.textContent ?? null,
      highlightedSpans: dock?.querySelectorAll('.lp-tag-active').length ?? 0,
      headline: dock?.innerText.split('\\n').slice(0, 2).join(' | ').slice(0, 120) ?? null,
      // Shared ui-primitives controls, proven by their own DOM attributes.
      tagTones: [...(dock?.querySelectorAll('[data-tone]') ?? [])].map((el) => el.getAttribute('data-tone')),
      chipCount: dock?.querySelectorAll('.lp-chip').length ?? 0,
      buttonCount: dock?.querySelectorAll('.lp-head button').length ?? 0,
      draft: editor?.innerText ?? null,
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      activeText: active?.textContent?.slice(0, 40) ?? null,
    }
  })()`)
  step('preview-valid', {
    katex: bench.katex,
    displayBlocks: bench.displayBlocks,
    bench: bench.bench,
    benchRendered: bench.benchRendered,
    benchStatus: bench.benchStatus,
    headline: bench.headline,
    tagTones: bench.tagTones,
    chipCount: bench.chipCount,
    buttonCount: bench.buttonCount,
  })

  if (!bench.present) fail('the dock did not render above the composer')
  if (bench.katex < 3) fail(`expected at least 3 typeset formulas, saw ${bench.katex}`)
  if (bench.displayBlocks !== 1) fail(`expected 1 display block, saw ${bench.displayBlocks}`)
  if (!bench.bench) fail('the caret bench did not appear with the caret inside a formula')
  if (bench.benchSource !== '\\alpha + \\beta' && !/alpha/.test(bench.benchSource ?? '')) {
    fail(`the bench showed the wrong formula: ${JSON.stringify(bench.benchSource)}`)
  }
  if (bench.highlightedSpans !== 1) fail(`expected 1 highlighted span, saw ${bench.highlightedSpans}`)
  // Conformance evidence: the chips and the collapse control are the shared
  // ui-primitives ones, not local copies.
  if (!(bench.tagTones ?? []).includes('neutral')) fail('the sends-source chip is not a ui-primitives Tag')
  if ((bench.chipCount ?? 0) < 1) fail('the header chips are missing')
  if ((bench.buttonCount ?? 0) < 1) fail('the collapse control is not a ui-primitives Button')
  // The whole point: the preview must not rewrite what gets sent.
  if (bench.draft !== VALID_DRAFT) {
    fail(`the draft was altered by the preview\n    expected: ${JSON.stringify(VALID_DRAFT)}\n    actual:   ${JSON.stringify(bench.draft)}`)
  }
  const tooltip = await hoverTooltip(page, '.lp-chip')
  step('tooltip-on-hover', { tooltip })
  if (tooltip === null) fail('hovering a header chip produced no ui-primitives Tooltip bubble')
  else if (!/源码|LaTeX/.test(tooltip)) fail(`the tooltip showed unexpected copy: ${JSON.stringify(tooltip)}`)

  step('screenshot-valid', { path: await shoot(page, 'preview-valid', bench.rect) })

  // ---- a malformed formula must be caught before sending ----
  await page.send('Input.insertText', { text: BROKEN_TAIL })
  await sleep(1400)
  const broken = await page.eval(`(() => {
    const dock = document.querySelector('.lp-root')
    return {
      // The head chips are the shared ui-primitives Tag; data-tone is its own
      // attribute, so this also proves the shared control rendered.
      errorFlag: dock?.querySelector('[data-tone="danger"]')?.textContent ?? null,
      tones: [...(dock?.querySelectorAll('[data-tone]') ?? [])].map((el) => el.getAttribute('data-tone')),
      brokenSpans: dock?.querySelectorAll('.lp-broken').length ?? 0,
      badBench: dock !== null && dock.querySelector('.lp-bench-bad') !== null,
      badBenchSource: dock?.querySelector('.lp-bench-src-bad')?.textContent ?? null,
      detail: dock?.querySelector('.lp-bench-detail')?.textContent ?? null,
      rect: (() => { const r = dock?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null })(),
    }
  })()`)
  step('error-surfacing', broken)
  if (broken.brokenSpans === 0) fail('a malformed formula was not flagged before sending')
  if (broken.errorFlag === null) fail('the head strip did not report the parse failure')
  if (!broken.badBench) fail('the caret bench did not switch to its error treatment')
  step('screenshot-broken', { path: await shoot(page, 'preview-broken', broken.rect) })

  // ---- collapsing ----
  const collapsedBy = await page.eval(`(() => {
    const el = document.querySelector('.lp-head button[aria-label]')
    if (el === null) return null
    el.click()
    return el.getAttribute('aria-label')
  })()`)
  step('collapse-clicked', { collapsedBy })
  await sleep(600)
  const collapsed = await page.eval(`(() => {
    const dock = document.querySelector('.lp-root')
    const r = dock?.getBoundingClientRect()
    return {
      strip: dock !== null && dock.querySelector('.lp-strip') !== null,
      text: dock?.innerText.replace(/\\n/g, ' ') ?? null,
      height: r ? Math.round(r.height) : null,
      rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
    }
  })()`)
  step('collapsed', collapsed)
  if (!collapsed.strip) fail('the collapsed strip did not render')
  step('screenshot-collapsed', { path: await shoot(page, 'preview-collapsed', collapsed.rect) })

  // Expand again for the settings pass.
  await page.eval(`document.querySelector('.lp-strip').click()`)
  await sleep(400)

  // ---- feature: sent messages render typeset, and copy yields source ----
  await page.eval(`(() => {
    const el = document.querySelector('[data-lexical-editor="true"]')
    el.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  })()`)
  await page.send('Input.insertText', { text: SENT_DRAFT })
  await sleep(1200)
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter',
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' })
  await sleep(5000)

  const sent = await page.eval(`(() => {
    const row = document.querySelector('.lp-user-row')
    if (row === null) return { present: false }
    return {
      present: true,
      katex: row.querySelectorAll('.katex').length,
      displayBlocks: row.querySelectorAll('.lp-sent-display').length,
      rawSourceShown: /\\$E = mc\\^2\\$/.test(row.innerText),
      text: row.innerText.replace(/\\n/g, ' | ').slice(0, 140),
      bubble: row.querySelector('.lp-bubble') !== null,
      actions: row.querySelectorAll('.lp-action').length,
      time: row.querySelector('.lp-time')?.textContent ?? null,
    }
  })()`)
  step('sent-message', sent)
  if (!sent.present) fail('the sent user message did not render through the plugin renderer')
  if ((sent.katex ?? 0) < 2) fail(`expected the sent message to typeset 2 formulas, saw ${sent.katex ?? 0}`)
  if (sent.rawSourceShown) fail('the sent message still shows raw LaTeX source')
  if (!sent.bubble) fail('the reproduced bubble is missing')
  if ((sent.actions ?? 0) < 1) fail('the message copy action is missing')

  // What the copy action puts on the real clipboard must still be the source.
  await page.send('Browser.grantPermissions', {
    origin: new URL(url).origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })
  const copiedSource = await page.eval(`(async () => {
    const btn = document.querySelector('.lp-user-row .lp-action')
    if (btn === null) return null
    btn.click()
    await new Promise((r) => setTimeout(r, 250))
    try {
      return await navigator.clipboard.readText()
    } catch (error) {
      return 'READ_FAILED: ' + String(error && error.message)
    }
  })()`)
  step('copy-action', { text: copiedSource })
  if (copiedSource !== SENT_DRAFT) {
    fail(`the message copy action did not yield the source\n    expected: ${JSON.stringify(SENT_DRAFT)}\n    actual:   ${JSON.stringify(copiedSource)}`)
  }

  // Every mouse gesture that reaches a formula must yield source. A selection
  // that starts or ends *inside* a formula is the case that used to fail: the
  // cloned range holds KaTeX's inner HTML with no `.katex` to recognise.
  const selectionCopies = await page.eval(`(() => {
    const row = document.querySelector('.lp-user-row')
    const formulas = [...row.querySelectorAll('.katex')]
    if (formulas.length < 2) return { error: 'expected 2 formulas, saw ' + formulas.length }

    const fire = (range) => {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      const event = new ClipboardEvent('copy', {
        clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
      })
      const from = range.startContainer.nodeType === 1
        ? range.startContainer
        : range.startContainer.parentElement
      from.dispatchEvent(event)
      return { handled: event.defaultPrevented, plain: event.clipboardData.getData('text/plain') }
    }

    const innerText = (el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node !== null && (node.data ?? '').trim() === '') node = walker.nextNode()
      return node
    }

    const out = {}
    {
      const r = document.createRange()
      r.selectNode(formulas[0])
      out.wholeFormula = fire(r)
    }
    {
      const node = innerText(formulas[0])
      const r = document.createRange()
      r.setStart(node, 0)
      r.setEnd(node, 1)
      out.insideFormula = fire(r)
    }
    {
      const node = innerText(formulas[0])
      const other = innerText(formulas[1])
      const r = document.createRange()
      r.setStart(node, 0)
      r.setEnd(other, 1)
      out.formulaToFormula = fire(r)
    }
    {
      const walker = document.createTreeWalker(row.querySelector('.lp-bubble'), NodeFilter.SHOW_TEXT)
      const texts = []
      let node = walker.nextNode()
      while (node !== null) {
        if ((node.data ?? '').trim() !== '') texts.push(node)
        node = walker.nextNode()
      }
      const r = document.createRange()
      r.setStart(texts[0], 1)
      r.setEnd(texts[texts.length - 1], texts[texts.length - 1].data.length)
      out.proseDrag = fire(r)
    }
    return out
  })()`)
  step('selection-copy', selectionCopies)

  if (selectionCopies.error !== undefined) fail(selectionCopies.error)
  else {
    // Inline math comes back as `$…$`; the display block as `$$…$$` on its own
    // lines. Asserted by content rather than by shape, so the newlines the
    // display form legitimately adds cannot make this brittle.
    const inline = '$E = mc^2$'
    const displayHead = '$$\\int_0^1 x\\,dx'
    const expectations = [
      ['wholeFormula', [inline], []],
      ['insideFormula', [inline], []],
      ['formulaToFormula', [inline, displayHead, '\\frac{1}{2}$$'], []],
      ['proseDrag', ['发送公式', inline, displayHead, '\\frac{1}{2}$$'], []],
    ]
    for (const [name, wanted] of expectations) {
      const result = selectionCopies[name]
      if (result === undefined) {
        fail(`copy case ${name} did not run`)
        continue
      }
      if (result.handled !== true) {
        fail(`copy case ${name} was not intercepted`)
        continue
      }
      for (const fragment of wanted) {
        if (!String(result.plain).includes(fragment)) {
          fail(`copy case ${name} is missing ${JSON.stringify(fragment)} in ${JSON.stringify(result.plain)}`)
        }
      }
    }
  }

  await page.eval(`window.getSelection()?.removeAllRanges()`)
  await sleep(200)
  // Frame the bubble itself, not the full-width row: the row is mostly empty
  // space to the left of a right-aligned message.
  step('screenshot-sent', { path: await shoot(page, 'sent-message', await page.eval(`(() => {
    const stack = document.querySelector('.lp-user-stack')?.getBoundingClientRect()
    const row = document.querySelector('.lp-user-row')?.getBoundingClientRect()
    if (stack === undefined || row === undefined) return null
    // Keep the author's own action row (clock + copy) in frame under the bubble.
    return { x: stack.x, y: row.y, width: stack.width, height: row.height }
  })()`) ) })

  // ---- settings section ----
  const openedSettings = await page.clickButton(/^设置$|^Settings$/)
  await sleep(1600)
  const settings = await page.eval(`(() => {
    const navs = [...document.querySelectorAll('button, [role="tab"], [role="button"], li, a')]
      .map((el) => (el.innerText || '').trim())
      .filter((t) => t.length > 0 && t.length < 30)
    const section = [...document.querySelectorAll('button, [role="tab"], [role="button"], li, a')]
      .find((el) => /LaTeX 预览|LaTeX preview/.test((el.innerText || '').trim()))
    if (section) section.click()
    return { found: section !== undefined, navs: [...new Set(navs)].slice(0, 30) }
  })()`)
  step('settings-nav', { found: openedSettings !== null, section: settings.found })
  if (!settings.found) fail(`the settings section is not in the nav: ${JSON.stringify(settings.navs)}`)
  await sleep(900)
  const panel = await page.eval(`(() => {
    const root = document.querySelector('.lp-set')
    if (root === null) return { present: false }
    const r = root.getBoundingClientRect()
    return {
      present: true,
      switches: root.querySelectorAll('[role="switch"]').length,
      heights: [...root.querySelectorAll('.lp-set-choices button')].map((b) => b.textContent),
      choices: root.querySelectorAll('.lp-set-choices button').length,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    }
  })()`)
  step('settings-panel', panel)
  if (!panel.present) fail('the settings panel did not render')
  if (panel.switches !== 4) fail(`expected 4 switches, saw ${panel.switches}`)
  step('screenshot-settings', { path: await shoot(page, 'settings', panel.rect) })

  const consoleErrors = page.consoleErrors(/latex-preview|ModuleLoader|katex/i)
  step('console-errors', { count: consoleErrors.length, sample: consoleErrors.slice(0, 5) })
  for (const text of consoleErrors) fail(`console error: ${text}`)
} catch (error) {
  fail(`driver error: ${error && error.stack ? error.stack : String(error)}`)
} finally {
  kill()
  writeFileSync(join(root, 'verify', 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

console.log(`\n[verify] ${report.failures.length} failure(s)`)
process.exit(report.failures.length === 0 ? 0 : 1)
