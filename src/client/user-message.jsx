/**
 * Chat-node renderer for the user's own messages, with math typeset.
 *
 * Why this takes over the row: `conversation.chat.node` is a keyed slot, and
 * reusing a key replaces that renderer outright — there is no way to typeset the
 * text while leaving the shipped bubble in place. The bubble is therefore
 * reproduced here, but *only* the parts that already exist: the layout, the
 * attachment cards and the action row are rebuilt from the same semantic tokens
 * and the same exported primitives the shell uses, and the text itself still
 * goes through `primitives.projectUserText`, so command and file chips keep the
 * shell's own projection.
 *
 * The one addition is that each plain run is scanned for math and typeset. A
 * message with no math renders exactly as before; the draft — and therefore what
 * the model received — is never touched, and the message-level copy action still
 * receives the source text.
 */
import React from 'react'
import { scanMath, buildBlocks } from './tex.js'
import { renderMath } from './katex-runtime.js'

/** Split content blocks into text, attachments and everything else — the shell's own partition. */
function contentParts(content) {
  const texts = []
  const attachments = []
  const rest = []
  for (const block of content) {
    const candidate = block
    if (candidate.type === 'text' && typeof candidate.text === 'string') texts.push(candidate.text)
    else if (candidate.type === 'image' && candidate.attachment !== undefined) {
      attachments.push({ type: 'image', image: { attachment: candidate.attachment } })
    } else if (candidate.type === 'file' && candidate.attachment !== undefined) {
      attachments.push({ type: 'file', file: candidate.attachment })
    } else rest.push(block)
  }
  return { text: texts.join(''), attachments, rest }
}

const pad2 = (value) => String(value).padStart(2, '0')

/**
 * Format a message clock the way the transcript does: bare time today, a short
 * date before that, a full date across a year boundary.
 * @param {number} time - message epoch milliseconds.
 * @param {Function} t - bound translate.
 * @param {number} now - current epoch milliseconds.
 * @returns {string} the formatted clock.
 */
function formatClock(time, t, now) {
  const at = new Date(time)
  const today = new Date(now)
  const clock = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  if (at.toDateString() === today.toDateString()) return clock
  const params = { y: at.getFullYear(), m: at.getMonth() + 1, d: at.getDate() }
  return at.getFullYear() === today.getFullYear()
    ? `${t('clockMd', params)} ${clock}`
    : `${t('clockYmd', params)} ${clock}`
}

/** One typeset formula inside a text run. */
function Formula({ span }) {
  const { html, error } = renderMath(span.body, span.display === 'display')
  if (error !== null) {
    return (
      <span className="lp-broken" title={error}>
        {span.raw}
      </span>
    )
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * Typeset one plain text run, preserving its line breaks.
 *
 * Display math is lifted onto its own line, matching how the assistant's
 * markdown renders it; everything else stays in the bubble's pre-wrap flow.
 * @param {{text: string}} props - the run's text.
 * @returns {import('react').ReactElement} the run's nodes.
 */
function TypesetRun({ text }) {
  const scan = React.useMemo(() => scanMath(text), [text])
  const blocks = React.useMemo(() => buildBlocks(scan.segments), [scan])

  return blocks.map((block, index) => {
    if (block.kind === 'display') {
      return (
        <span className="lp-sent-display" key={`d${block.span.start}`}>
          <Formula span={block.span} />
        </span>
      )
    }
    return (
      <React.Fragment key={`f${index}`}>
        {block.parts.map((part, partIndex) =>
          part.kind === 'text' ? (
            <React.Fragment key={`t${partIndex}`}>{part.text}</React.Fragment>
          ) : (
            <Formula key={`m${part.span.start}`} span={part.span} />
          ),
        )}
      </React.Fragment>
    )
  })
}

/**
 * Take the shell's own projection and typeset the plain runs inside it.
 *
 * Chips carry `data-ref-chip`; a run without it is plain text. Anything that is
 * not a plain-text element is returned untouched, so the chip markup, its icon
 * and its title are exactly what the shell produced.
 *
 * @param {React.ReactNode} projected - the result of `primitives.projectUserText`.
 * @param {boolean} typeset - whether to typeset at all.
 * @returns {React.ReactNode} the runs.
 */
function runs(projected, typeset) {
  if (!typeset) return projected
  return React.Children.map(projected, (child) => {
    if (!React.isValidElement(child)) return child
    if (child.props['data-ref-chip'] !== undefined) return child
    const text = child.props.children
    if (typeof text !== 'string' || !scanMath(text).hasMath) return child
    return React.cloneElement(child, {}, <TypesetRun text={text} />)
  })
}

/** The attachment rail: image groups and file cards, as the shell lays them out. */
function Attachments({ attachments, renderMessageImages, primitives }) {
  const compactImages = attachments.length > 1
  return (
    <div className="lp-attach-row" data-message-attachments="">
      {attachments.map((attachment, index) =>
        attachment.type === 'image' ? (
          <React.Fragment key={`image:${index}`}>
            {renderMessageImages({ images: [attachment.image], align: 'end', compact: compactImages })}
          </React.Fragment>
        ) : (
          <span className="lp-file-card" key={`file:${index}`} title={attachment.file.name}>
            <primitives.FileTypeIcon path={attachment.file.name} className="lp-file-icon" />
            <span className="lp-file-content">
              <span className="lp-file-name">{attachment.file.name}</span>
              <span className="lp-file-meta">
                {[primitives.fileExtension(attachment.file.name).toUpperCase().slice(0, 8), primitives.fileSizeText(attachment.file.bytes)]
                  .filter(Boolean)
                  .join(' ')}
              </span>
            </span>
          </span>
        ),
      )}
    </div>
  )
}

/** The clock and copy action under one user message. */
function Actions({ text, time, t, primitives }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef(null)
  React.useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  const onCopy = React.useCallback(() => {
    primitives.writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      timer.current = window.setTimeout(() => setCopied(false), 1000)
    })
  }, [primitives, text])

  return (
    <div className="lp-actions">
      {time !== undefined && <span className="lp-time">{formatClock(time, t, Date.now())}</span>}
      <primitives.Tooltip label={copied ? t('copied') : t('copy')} side="bottom">
        <button type="button" className="lp-action" aria-label={t('copy')} onClick={onCopy}>
          <primitives.IconCopyOutline16 />
        </button>
      </primitives.Tooltip>
    </div>
  )
}

/**
 * One user or steering message.
 * @param {object} props - chat-node props plus the injected bound `t` and primitives.
 * @returns {import('react').ReactElement} the row.
 */
export const UserMessageNodeView = React.memo(function UserMessageNodeView(props) {
  const { node, renderMessageImages, t, primitives, typeset } = props
  const data = node.data
  const { text, attachments, rest } = contentParts(data.content ?? [])
  const referenceLabels = data.referenceLabels ?? []
  const skillNames = data.skillNames ?? []
  const showBubble = text !== '' || rest.length > 0

  const projected = primitives.projectUserText(text, referenceLabels, skillNames)

  return (
    <div className="lp-scope lp-user-row">
      <div className="lp-user-stack">
        {attachments.length > 0 && (
          <Attachments attachments={attachments} renderMessageImages={renderMessageImages} primitives={primitives} />
        )}
        {showBubble && (
          <div className="lp-bubble">
            {runs(projected, typeset)}
            {rest.map((block, index) => (
              <primitives.JsonBlock
                key={index}
                label={t('extraBlock')}
                payload={block}
                truncatedLabel={(total) => t('truncated', { total })}
              />
            ))}
          </div>
        )}
        {referenceLabels.length > 0 && (
          <div className="lp-ref-summary">
            {t('referenceSummary', { labels: referenceLabels.join(t('referenceSeparator')) })}
          </div>
        )}
      </div>
      <Actions text={text} time={data.time} t={t} primitives={primitives} />
    </div>
  )
})
