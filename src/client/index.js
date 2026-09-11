/**
 * dsh-latex-preview — browser entry.
 *
 * Registers a composer dock that typesets the draft as it is typed, plus a
 * settings section for its three preferences. Nothing here writes to the draft
 * or intercepts submission: the request carries exactly what the user typed.
 *
 * Three modules are requested from the shell's static table rather than
 * bundled, so the plugin shares the shell's React instance and reuses the
 * shared controls instead of shipping a second copy of either: `react`,
 * `react/jsx-runtime`, and `@deepseek-ai/dsh-client-ui-primitives`. The same
 * three are declared in `dsh.client.external` so the composition can see the
 * requests it must satisfy.
 */
import React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { CSS } from './styles.js'
import { KATEX_CSS } from './katex-runtime.js'
import { PreviewDock } from './dock.jsx'
import { LatexSettings } from './settings.jsx'
import { UserMessageNodeView } from './user-message.jsx'
import { installCopyLatex } from './copy-latex.js'
import { prefs } from './prefs.js'
import { DICTS, NS } from './locales.js'

export const inject = ['slots', 'locale']

/** Slot-entry id shared by both contributions. */
const ID = 'latex-preview'

/**
 * Mount the plugin.
 * @param {object} ctx - client plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-latex-preview: dictionaries')

  const style = document.createElement('style')
  style.setAttribute('data-plugin-css', 'dsh-latex-preview')
  // The vendored KaTeX sheet stays scoped under the stable `.lp-scope` class and
  // its faces are renamed `LPKaTeX_*`, so the transcript's own KaTeX rendering
  // is untouched by this plugin.
  style.textContent = `${CSS}\n${KATEX_CSS}`
  document.head.appendChild(style)
  ctx.effect(() => () => style.remove(), 'dsh-latex-preview: stylesheet')

  const slots = ctx.get('slots')
  if (slots === undefined) {
    console.error('[dsh-latex-preview] the slots service is unavailable; the preview is not mounted')
    return
  }

  const t = ctx.locale.bind(NS)

  slots.inject('conversation.input.dock', () =>
    slots.register(
      {
        name: 'conversation.input.dock',
        id: ID,
        // Below the todo (0), queue (20) and approval notice (30): the preview is
        // ambient chrome, and never displaces something the user must read.
        order: 45,
        label: () => t('title'),
        locale: NS,
      },
      (props) => React.createElement(PreviewDock, { ...props, primitives }),
    ),
  )

  slots.inject('settings.section', () =>
    slots.register(
      {
        name: 'settings.section',
        id: ID,
        order: 58,
        label: () => t('settingsTitle'),
        locale: NS,
      },
      (props) => React.createElement(LatexSettings, { ...props, primitives }),
    ),
  )

  // Sent messages: `conversation.chat.node` is keyed, and reusing a key replaces
  // that renderer, so taking `user` and `steering` means owning the bubble. The
  // renderer reproduces the shell's own layout and reuses its projection, so the
  // only difference from the shipped row is that formulas are typeset. With the
  // preference off it renders the same tree without scanning.
  for (const key of ['user', 'steering']) {
    slots.inject('conversation.chat.node', () =>
      slots.register(
        { name: 'conversation.chat.node', key, locale: NS },
        (props) =>
          React.createElement(UserMessageNodeView, {
            ...props,
            t,
            primitives,
            typeset: prefs.get().typesetSent,
          }),
      ),
    )
  }

  // Copying a rendered formula yields its source. Read live, so the switch
  // applies to the next selection rather than the next reload.
  ctx.effect(
    () => installCopyLatex(() => prefs.get().copyLatex),
    'dsh-latex-preview: copy-as-latex',
  )
}

export default { inject, apply }
