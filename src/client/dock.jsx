/**
 * The composer dock: a live proof of the draft.
 *
 * Two tracks share one panel. The document track sets the whole draft the way
 * the transcript will, so a formula that typesets alone but breaks its
 * sentence is visible before sending. The bench track lifts the formula under
 * the caret and pairs its render with the exact source that will be sent.
 *
 * The draft is only ever read, never rewritten.
 *
 * Controls are the shared `ui-primitives` ones (`Tag`, `Button`, `Tooltip` and
 * the icon set) rather than local copies, so the panel cannot drift from the
 * rest of the shell. Only the two layout constructs the catalogue does not
 * offer — the bench and the typeset proof — are styled here.
 */
import React from 'react'
import { buildBlocks, scanMath, spanAt } from './tex.js'
import { caretOffset, locateEditor, observeCaret } from './caret.js'
import { renderMath } from './katex-runtime.js'
import { prefs } from './prefs.js'

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Re-render on any preference change. */
function usePrefs() {
  const [, bump] = React.useReducer((n) => n + 1, 0)
  React.useEffect(() => prefs.subscribe(bump), [])
  return prefs.get()
}

/**
 * One typeset formula.
 * @param {{span: object, active: boolean, register: (el: Element | null) => void}} props - span and state.
 * @returns {import('react').ReactElement} the node.
 */
function Formula({ span, active, register }) {
  const { html, error } = renderMath(span.body, span.display === 'display')
  const className = [
    'lp-tag',
    active ? 'lp-tag-active' : '',
    error !== null ? 'lp-tag-bad' : '',
    span.typeset ? '' : 'lp-flagged',
  ]
    .filter(Boolean)
    .join(' ')

  if (error !== null) {
    return (
      <span className={className} ref={register} title={error}>
        <span className="lp-broken">{span.raw}</span>
      </span>
    )
  }
  return <span className={className} ref={register} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * The document track: the draft set as the transcript will set it.
 * @param {{blocks: ReadonlyArray<object>, activeIndex: number, register: Function}} props - prepared blocks.
 * @returns {import('react').ReactElement} the tree.
 */
function Proof({ blocks, activeIndex, register }) {
  return blocks.map((block, blockIndex) => {
    if (block.kind === 'display') {
      return (
        <div className="lp-display" key={`d${block.span.start}`}>
          <Formula
            span={block.span}
            active={block.span.index === activeIndex}
            register={register(block.span.index)}
          />
        </div>
      )
    }
    return (
      <p className="lp-para" key={`p${blockIndex}`}>
        {block.parts.map((part, partIndex) =>
          part.kind === 'text' ? (
            <React.Fragment key={`t${blockIndex}-${partIndex}`}>{part.text}</React.Fragment>
          ) : (
            <Formula
              key={`m${part.span.start}`}
              span={part.span}
              active={part.span.index === activeIndex}
              register={register(part.span.index)}
            />
          ),
        )}
      </p>
    )
  })
}

/**
 * The bench track: the formula under the caret.
 *
 * On success the render leads and the source sits under it quietly. On failure
 * there is no render, so the source becomes the thing to read — promoted, in the
 * error colour — with KaTeX's own words demoted to a technical footnote.
 *
 * @param {{span: object, t: Function}} props - the active span and its translate.
 * @returns {import('react').ReactElement} the bench.
 */
function Bench({ span, t }) {
  const { html, error } = renderMath(span.body, span.display === 'display')

  if (error !== null) {
    return (
      <div className="lp-bench lp-bench-bad">
        <div className="lp-bench-head">
          <span className="lp-bench-tag">{t('benchLabel')}</span>
          <span className="lp-spacer" />
          <span className="lp-bench-fail">{t('benchFail')}</span>
        </div>
        <div className="lp-bench-src lp-bench-src-bad">{span.raw}</div>
        <div className="lp-bench-detail">{error}</div>
      </div>
    )
  }

  return (
    <div className="lp-bench">
      <div className="lp-bench-head">
        <span className="lp-bench-tag">{t('benchLabel')}</span>
        <span className="lp-spacer" />
        <span className="lp-bench-ok">{t('benchOk')}</span>
      </div>
      <div className="lp-bench-stage" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="lp-bench-src">{span.raw}</div>
    </div>
  )
}

/**
 * Summarize a scan for the head strip.
 * @param {object} scan - result of {@link scanMath}.
 * @param {Function} t - bound translate.
 * @returns {{count: string, tone: string | null, text: string, hint: string}} the summary.
 */
function summarize(scan, t) {
  const total = scan.spans.length
  const count = total === 1 ? t('formulaOne') : t('formulaMany', { n: total })

  if (scan.unclosed.length > 0) {
    const first = scan.unclosed[0]
    return {
      count,
      tone: 'danger',
      text: scan.unclosed.length === 1 ? t('unclosedOne') : t('unclosedMany', { n: scan.unclosed.length }),
      hint: t('unclosedHint', { line: first.line, delim: first.delim }),
    }
  }

  const broken = scan.spans.filter(
    (span) => renderMath(span.body, span.display === 'display').error !== null,
  ).length
  if (broken > 0) {
    return {
      count,
      tone: 'danger',
      text: broken === 1 ? t('problemOne') : t('problemMany', { n: broken }),
      hint: t('errorTitle'),
    }
  }

  if (scan.flaggedCount > 0) {
    return {
      count,
      tone: 'warning',
      text: scan.flaggedCount === 1 ? t('flaggedOne') : t('flaggedMany', { n: scan.flaggedCount }),
      hint: t('flaggedHint'),
    }
  }

  return { count, tone: null, text: '', hint: '' }
}

/**
 * The collapsed one-line strip.
 * @param {{scan: object, t: Function, primitives: object}} props - scan, translate, shared controls.
 * @returns {import('react').ReactElement} the strip.
 */
function Strip({ scan, t, primitives }) {
  const { IconChevronUpOutline14 } = primitives
  const total = scan.spans.length
  return (
    <button type="button" className="lp-strip" onClick={() => prefs.set({ collapsed: false })}>
      <span className="lp-mark" aria-hidden="true">
        Σ
      </span>
      <span>{t('title')}</span>
      <span className="lp-dot" />
      <span>{total === 1 ? t('formulaOne') : t('formulaMany', { n: total })}</span>
      <span className="lp-dot" />
      <span>{t('collapsedHint')}</span>
      <span className="lp-spacer" />
      <IconChevronUpOutline14 />
    </button>
  )
}

/**
 * The resident composer entry.
 * @param {object} props - slot props: standard session props, the InputZone owner
 *   share, the bound `t` from the locale seat, and the injected shared controls.
 * @returns {import('react').ReactElement | null} the dock, or null when there is nothing to prove.
 */
export const PreviewDock = React.memo(function PreviewDock(props) {
  const { t, primitives } = props
  const { Tag, Button, Tooltip, IconChevronDownOutline14 } = primitives
  const settings = usePrefs()

  const useInput = props.useInput
  // `useInput` is a standard prop of every session-scoped slot; without it there
  // is no draft to prove, so the dock contributes nothing.
  const draft = typeof useInput === 'function' ? useInput((state) => state.draft) : undefined

  const rootRef = React.useRef(null)
  const bodyRef = React.useRef(null)
  const anchors = React.useRef(new Map())
  const [caret, setCaret] = React.useState(null)

  React.useEffect(() => {
    if (!settings.enabled) return undefined
    const update = () => setCaret(caretOffset(locateEditor(rootRef.current)))
    update()
    return observeCaret(update)
  }, [settings.enabled])

  const text = typeof draft === 'string' ? draft : ''
  const scan = React.useMemo(() => scanMath(text), [text])
  const blocks = React.useMemo(() => buildBlocks(scan.segments), [scan])

  const active = settings.bench ? spanAt(scan.spans, caret) : null
  const activeIndex = active === null ? -1 : active.index

  // Keep the formula being edited inside the visible band — but only when it
  // has drifted out of it, so the panel never fights a deliberate scroll.
  React.useEffect(() => {
    const body = bodyRef.current
    const node = activeIndex < 0 ? null : anchors.current.get(activeIndex)
    if (body === null || node === undefined || node === null) return
    const top = node.offsetTop
    const bottom = top + node.offsetHeight
    const visibleTop = body.scrollTop + 24
    const visibleBottom = body.scrollTop + body.clientHeight - 12
    if (top >= visibleTop && bottom <= visibleBottom) return
    body.scrollTo({
      top: Math.max(0, top - body.clientHeight / 2 + node.offsetHeight / 2),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [activeIndex])

  const register = React.useCallback(
    (index) => (element) => {
      if (element === null) anchors.current.delete(index)
      else anchors.current.set(index, element)
    },
    [],
  )

  if (!settings.enabled) return null
  if (text.trim() === '') return null
  if (scan.spans.length === 0 && scan.unclosed.length === 0) return null

  if (settings.collapsed) {
    return (
      <div className="lp-root lp-scope" ref={rootRef}>
        <Strip scan={scan} t={t} primitives={primitives} />
      </div>
    )
  }

  const summary = summarize(scan, t)

  return (
    <div className="lp-root lp-scope lp-enter" ref={rootRef}>
      <section className="lp-card" aria-label={t('title')}>
        <header className="lp-head">
          <span className="lp-mark" aria-hidden="true">
            Σ
          </span>
          <span className="lp-title">{t('title')}</span>
          <span className="lp-dot" />
          <span className="lp-count">{summary.count}</span>
          {summary.tone !== null && (
            // `Tooltip` clones its single child to attach an anchor ref, so the
            // shared controls — which do not forward refs — ride a plain element.
            <Tooltip label={summary.hint} side="top">
              <span className="lp-chip">
                <Tag tone={summary.tone}>{summary.text}</Tag>
              </span>
            </Tooltip>
          )}
          <span className="lp-spacer" />
          <Tooltip label={t('rawBadgeHint')} side="top">
            <span className="lp-chip">
              <Tag tone="neutral">{t('rawBadge')}</Tag>
            </span>
          </Tooltip>
          <Tooltip label={t('collapse')} side="top">
            <span className="lp-action">
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('collapse')}
                icon={<IconChevronDownOutline14 />}
                onClick={() => prefs.set({ collapsed: true })}
              />
            </span>
          </Tooltip>
        </header>

        <div
          className="lp-body"
          ref={bodyRef}
          // A component-local layout value, not a theme branch: inline styles
          // may carry custom-property values, so the height rides one.
          style={{ '--lp-max-height': `${settings.maxHeight}px` }}
        >
          {active !== null && <Bench span={active} t={t} />}
          <div className="lp-doc">
            <Proof blocks={blocks} activeIndex={activeIndex} register={register} />
          </div>
          {scan.unclosed.length > 0 && (
            <p className="lp-note">
              {scan.unclosed
                .map((item) => t('unclosedHint', { line: item.line, delim: item.delim }))
                .join(' · ')}
            </p>
          )}
        </div>
      </section>
    </div>
  )
})
