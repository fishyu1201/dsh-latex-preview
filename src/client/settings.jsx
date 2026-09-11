/**
 * Settings → LaTeX preview.
 *
 * Three controls, no more: whether the dock runs, whether it lifts the formula
 * under the caret, and how tall it may grow before scrolling internally.
 *
 * The switches and the height buttons are the shared `ui-primitives` controls,
 * so this section matches every other settings surface without restating any of
 * their styling here.
 */
import React from 'react'
import { HEIGHT_CHOICES, prefs } from './prefs.js'

/** One labelled row: copy on the left, its control on the right. */
function Row({ label, note, control }) {
  return (
    <div className="lp-set-row">
      <span className="lp-set-text">
        <span className="lp-set-label">{label}</span>
        <span className="lp-set-note">{note}</span>
      </span>
      {control}
    </div>
  )
}

/**
 * The settings section entry.
 * @param {{t: Function, primitives: object}} props - bound translate and shared controls.
 * @returns {import('react').ReactElement} the section.
 */
export const LatexSettings = React.memo(function LatexSettings(props) {
  const { t, primitives } = props
  const { Switch, Button } = primitives

  const [, bump] = React.useReducer((n) => n + 1, 0)
  React.useEffect(() => prefs.subscribe(bump), [])
  const settings = prefs.get()

  return (
    <div className="lp-set">
      <p className="lp-set-hint">{t('settingsHint')}</p>

      <Row
        label={t('prefEnabled')}
        note={t('prefEnabledHint')}
        control={
          <Switch
            checked={settings.enabled}
            label={t('prefEnabled')}
            onChange={(next) => prefs.set({ enabled: next })}
          />
        }
      />

      <Row
        label={t('prefBench')}
        note={t('prefBenchHint')}
        control={
          <Switch
            checked={settings.bench}
            label={t('prefBench')}
            disabled={!settings.enabled}
            onChange={(next) => prefs.set({ bench: next })}
          />
        }
      />

      <Row
        label={t('prefTypesetSent')}
        note={t('prefTypesetSentHint')}
        control={
          <Switch
            checked={settings.typesetSent}
            label={t('prefTypesetSent')}
            onChange={(next) => prefs.set({ typesetSent: next })}
          />
        }
      />

      <Row
        label={t('prefCopyLatex')}
        note={t('prefCopyLatexHint')}
        control={
          <Switch
            checked={settings.copyLatex}
            label={t('prefCopyLatex')}
            onChange={(next) => prefs.set({ copyLatex: next })}
          />
        }
      />

      <Row
        label={t('prefHeight')}
        note={t('prefHeightHint')}
        control={
          <span className="lp-set-choices" role="group" aria-label={t('prefHeight')}>
            {HEIGHT_CHOICES.map((height) => (
              <Button
                key={height}
                size="sm"
                variant={settings.maxHeight === height ? 'primary' : 'outline'}
                aria-pressed={settings.maxHeight === height}
                onClick={() => prefs.set({ maxHeight: height })}
              >
                {height}
              </Button>
            ))}
          </span>
        }
      />
    </div>
  )
})
