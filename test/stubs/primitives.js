/**
 * A stand-in for `@deepseek-ai/dsh-client-ui-primitives` in Node.
 *
 * The real module only exists inside the browser module table, so the jsdom
 * suite supplies this instead. Each component mirrors the real implementation
 * extracted from the shell bundle — same prop names, same defaults, same DOM
 * shape, same callback signature — so a structural assertion here means the
 * same thing it would in the browser:
 *
 *   Button({variant = 'ghost', size = 'md', icon, className, children, ...rest})
 *     -> <button type="button" class="..." {...rest}>{icon && <span/>}{children}</button>
 *   Tag({tone = 'outline', className, children})
 *     -> <span class="..." data-tone={tone}>{children}</span>
 *   Switch({checked, onChange, label, disabled = false, title, className})
 *     -> <button role="switch" aria-checked onClick={() => onChange(!checked)} />
 *   Tooltip({label, side = 'right', delayMs = 0, disabled, maxWidth, children})
 *     -> clones its single child to attach the anchor ref; renders no wrapper
 *
 * The browser run in `verify/` exercises the real modules; this file only keeps
 * the Node suite honest about structure.
 */
import React from 'react'

/** `Button` — variants `ghost` (default), `outline`, `primary`; sizes `md` (default), `sm`. */
export function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }) {
  return React.createElement(
    'button',
    {
      type: 'button',
      className: ['lp-stub-button', `lp-stub-button-${variant}`, `lp-stub-button-${size}`, className]
        .filter(Boolean)
        .join(' '),
      ...rest,
    },
    icon != null ? React.createElement('span', { className: 'lp-stub-button-icon' }, icon) : null,
    children,
  )
}

/** `Tag` — tones seen in official use: `outline` (default), `neutral`, `success`, `warning`, `info`, `danger`, `solid`. */
export function Tag({ tone = 'outline', className, children }) {
  return React.createElement(
    'span',
    { className: ['lp-stub-tag', className].filter(Boolean).join(' '), 'data-tone': tone },
    children,
  )
}

/** `Switch` — `onChange` receives the *next* value, matching the real `onClick: () => onChange(!checked)`. */
export function Switch({ checked, onChange, label, disabled = false, title, className }) {
  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked,
    'aria-label': label,
    title,
    disabled,
    className: ['lp-stub-switch', className].filter(Boolean).join(' '),
    'data-on': checked ? '1' : '0',
    onClick: () => onChange(!checked),
  })
}

/**
 * `Tooltip` — the real one reads `children.ref` and renders its bubble through a
 * portal, adding no wrapper element. This stub keeps the child in place and
 * exposes the label as a data attribute for assertions.
 */
export function Tooltip({ label, side = 'right', delayMs = 0, disabled, maxWidth, children }) {
  const text = typeof label === 'function' ? label() : label
  return React.cloneElement(children, {
    'data-tooltip': text,
    'data-tooltip-side': side,
  })
}

/**
 * `projectUserText` — the real one tokenizes session references, `@path` and
 * `/command` tokens and returns `[<span class=plainRun>text</span>, <span
 * data-ref-chip=…>chip</span>, …]`, or a single plain run when nothing matches.
 * The stub keeps that contract: chips are marked the same way, everything else
 * is one plain run holding the raw text.
 */
export function projectUserText(text, referenceLabels = []) {
  const chips = new RegExp(`(@(?:${referenceLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'gu')
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(chips)) {
    if (match.index > cursor) {
      parts.push(React.createElement('span', { className: 'lp-stub-plain', key: `t${cursor}` }, text.slice(cursor, match.index)))
    }
    parts.push(
      React.createElement(
        'span',
        { className: 'lp-stub-chip', 'data-ref-chip': 'session', title: match[1], key: match.index },
        match[1],
      ),
    )
    cursor = match.index + match[1].length
  }
  if (parts.length === 0) {
    return [React.createElement('span', { className: 'lp-stub-plain', key: 't0' }, text)]
  }
  if (cursor < text.length) {
    parts.push(React.createElement('span', { className: 'lp-stub-plain', key: `t${cursor}` }, text.slice(cursor)))
  }
  return parts
}

/** `writeClipboard` — resolves true, like the real one on a permitted clipboard. */
export function writeClipboard(text) {
  globalThis.__lpCopied = text
  return Promise.resolve(true)
}

/** `FileTypeIcon` — an inline svg in the real build. */
export function FileTypeIcon({ className }) {
  return React.createElement('svg', { className, 'aria-hidden': 'true' })
}

/** `fileExtension` — uppercased by the caller. */
export function fileExtension(name) {
  const dot = String(name).lastIndexOf('.')
  return dot < 0 ? '' : String(name).slice(dot + 1)
}

/** `fileSizeText` — the real one formats bytes for humans. */
export function fileSizeText(bytes) {
  return typeof bytes === 'number' ? `${bytes} B` : ''
}

/** `JsonBlock` — the real one renders a labelled JSON disclosure. */
export function JsonBlock({ label, payload }) {
  return React.createElement(
    'div',
    { className: 'lp-stub-json', 'data-label': label },
    JSON.stringify(payload),
  )
}

/** `IconCopyOutline16`. */
export function IconCopyOutline16() {
  return React.createElement('svg', { width: 16, height: 16, 'aria-hidden': 'true' })
}

/** Chevron glyphs — the real ones take a `size` prop and render an inline SVG. */
function chevron(name, path) {
  return function Chevron({ size = 14, className, ...rest }) {
    return React.createElement(
      'svg',
      { width: size, height: size, viewBox: '0 0 14 14', className, 'aria-hidden': 'true', ...rest },
      React.createElement('path', { d: path }),
    )
  }
}

/** Up chevron, 14px. */
export const IconChevronUpOutline14 = chevron('IconChevronUpOutline14', 'M3 9l4-4 4 4')
/** Down chevron, 14px. */
export const IconChevronDownOutline14 = chevron('IconChevronDownOutline14', 'M3 5l4 4 4-4')
