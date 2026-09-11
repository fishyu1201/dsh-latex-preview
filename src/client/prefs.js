/**
 * Persisted preferences and session-scoped UI state.
 *
 * A snapshot store keeps every mounted surface (dock, collapsed strip, settings
 * section) on one source of truth, so toggling a switch in settings repaints the
 * composer immediately.
 *
 * **Why `localStorage` and not the durable settings scope.** The documented path
 * for a feature's preferences is a Host-registered settings namespace read
 * through `ctx.settingsScope.bind({ namespace })`. That registration needs a
 * `@deepseek-ai/schemastery` schema, and an out-of-tree plugin whose source lives
 * outside the profile can only get one by declaring the package as its own
 * dependency — which risks a second schemastery instance that `settings.register`
 * would not recognise as its own, failing the whole plugin rather than just its
 * three switches. These are presentational preferences for a preview panel, so
 * the trade is a local, browser-scoped store instead of a risky host dependency.
 * See CONFORMANCE.md, "Deviations".
 */

const STORAGE_KEY = 'dsh-latex-preview:prefs:v1'

/** @typedef {{enabled: boolean, bench: boolean, collapsed: boolean, maxHeight: number, typesetSent: boolean, copyLatex: boolean}} Prefs */

/** @type {Prefs} */
const DEFAULTS = {
  enabled: true,
  bench: true,
  collapsed: false,
  maxHeight: 280,
  typesetSent: true,
  copyLatex: true,
}

/** Heights offered in settings, in CSS pixels. */
export const HEIGHT_CHOICES = [180, 280, 400]

const clampHeight = (value) => (HEIGHT_CHOICES.includes(value) ? value : DEFAULTS.maxHeight)

/** @returns {Prefs} the stored preferences, with unknown fields defaulted. */
function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      bench: typeof parsed.bench === 'boolean' ? parsed.bench : DEFAULTS.bench,
      collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : DEFAULTS.collapsed,
      maxHeight: clampHeight(parsed.maxHeight),
      typesetSent: typeof parsed.typesetSent === 'boolean' ? parsed.typesetSent : DEFAULTS.typesetSent,
      copyLatex: typeof parsed.copyLatex === 'boolean' ? parsed.copyLatex : DEFAULTS.copyLatex,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * A minimal snapshot store: `get()` for synchronous reads, `subscribe` for repaints.
 * @param {Prefs} initial - starting value.
 * @returns {{get: () => Prefs, set: (patch: Partial<Prefs>) => void, subscribe: (fn: () => void) => () => void}} the store.
 */
function createStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set(patch) {
      const next = { ...value, ...patch }
      if (
        next.enabled === value.enabled &&
        next.bench === value.bench &&
        next.collapsed === value.collapsed &&
        next.maxHeight === value.maxHeight &&
        next.typesetSent === value.typesetSent &&
        next.copyLatex === value.copyLatex
      ) {
        return
      }
      value = next
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // A blocked storage backend costs persistence, not the preview.
      }
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The one preferences store every surface shares. */
export const prefs = createStore(read())
