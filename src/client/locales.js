/**
 * Copy for the preview, registered into the shell's locale registry.
 *
 * The dock and the settings section both declare `locale: NS` on their slot
 * entries, so the framework hands each component its bound `t`. Nothing here
 * reads the language itself: switching language in Settings repaints the panel
 * through the same seat every other feature uses.
 *
 * Both dictionaries carry identical key sets — `ctx.locale.register` enforces
 * that balance at registration.
 */

/** Namespace owned by this plugin. */
export const NS = 'latex-preview'

const zh = {
  title: 'LaTeX 预览',
  collapse: '收起预览',
  expand: '展开预览',
  rawBadge: '发送 LaTeX 原文',
  rawBadgeHint: '发送给模型的是你键入的 LaTeX 源码，预览不会被发送',
  formulaOne: '1 个公式',
  formulaMany: '{n} 个公式',
  problemOne: '1 个公式无法排版',
  problemMany: '{n} 个公式无法排版',
  flaggedOne: '1 处使用了 \\[…\\] / \\(…\\)',
  flaggedMany: '{n} 处使用了 \\[…\\] / \\(…\\)',
  flaggedHint: '这两种分隔符不会被对话正文当作公式排版，改用 $…$ 或 $$…$$ 更稳妥',
  unclosedOne: '1 处分隔符未闭合',
  unclosedMany: '{n} 处分隔符未闭合',
  unclosedHint: '第 {line} 行的 {delim} 没有找到闭合符号，会按普通文字发送',
  benchLabel: '正在编辑',
  benchOk: '排版正常',
  benchFail: '语法错误',
  errorTitle: '无法排版',
  collapsedHint: '预览已收起',
  settingsTitle: 'LaTeX 预览',
  settingsHint: '在输入框上方实时排版草稿中的公式。发送的始终是源码。',
  prefEnabled: '启用预览',
  prefEnabledHint: '在输入框上方显示实时排版。关闭后发送内容不受影响。',
  prefBench: '聚焦正在编辑的公式',
  prefBenchHint: '光标位于某个公式内部时，把该公式放大显示在顶部。',
  prefHeight: '预览最大高度 (px)',
  prefHeightHint: '超出后预览内部滚动，不占用对话区域。',
  prefTypesetSent: '已发送消息也排版公式',
  prefTypesetSentHint: '把你发出去的消息里的公式排出来，而不是显示 LaTeX 源码。原文始终保留，复制与编辑拿到的都是源码。',
  prefCopyLatex: '复制公式时给出 LaTeX 源码',
  prefCopyLatexHint: '选中已排版的公式复制时，写入剪贴板的是 $…$ 源码，而不是排版后的字形。',
  copy: '复制',
  copied: '已复制',
  clockMd: '{m}月{d}日',
  clockYmd: '{y}年{m}月{d}日',
  extraBlock: '附加内容块',
  truncated: '… 已截断，共 {total} 字符',
  referenceSummary: '引用会话 · {labels}',
  referenceSeparator: '、',
}

const en = {
  title: 'LaTeX preview',
  collapse: 'Collapse preview',
  expand: 'Expand preview',
  rawBadge: 'sends raw LaTeX',
  rawBadgeHint: 'The model receives the LaTeX you typed. The preview is never sent.',
  formulaOne: '1 formula',
  formulaMany: '{n} formulas',
  problemOne: '1 formula will not typeset',
  problemMany: '{n} formulas will not typeset',
  flaggedOne: '1 span uses \\[…\\] / \\(…\\)',
  flaggedMany: '{n} spans use \\[…\\] / \\(…\\)',
  flaggedHint: 'The transcript does not typeset these delimiters — prefer $…$ or $$…$$.',
  unclosedOne: '1 delimiter left unclosed',
  unclosedMany: '{n} delimiters left unclosed',
  unclosedHint: 'The {delim} on line {line} has no closing delimiter — it sends as plain text',
  benchLabel: 'Editing',
  benchOk: 'typeset clean',
  benchFail: 'syntax error',
  errorTitle: 'Will not typeset',
  collapsedHint: 'Preview collapsed',
  settingsTitle: 'LaTeX preview',
  settingsHint: 'Typesets the draft in the composer as you type. The source is what gets sent.',
  prefEnabled: 'Enable preview',
  prefEnabledHint: 'Shows the live typeset draft above the composer. Turning it off changes nothing about what is sent.',
  prefBench: 'Focus the formula being edited',
  prefBenchHint: 'When the caret sits inside a formula, show it enlarged at the top.',
  prefHeight: 'Maximum preview height (px)',
  prefHeightHint: 'Taller drafts scroll inside the preview instead of pushing the transcript.',
  prefTypesetSent: 'Typeset formulas in sent messages',
  prefTypesetSentHint: 'Show your own sent messages with their math typeset instead of raw LaTeX. The source is always kept — copying and editing still use it.',
  prefCopyLatex: 'Copy formulas as LaTeX source',
  prefCopyLatexHint: 'Selecting a typeset formula copies its $…$ source instead of the rendered glyphs.',
  copy: 'Copy',
  copied: 'Copied',
  clockMd: '{m}/{d}',
  clockYmd: '{y}-{m}-{d}',
  extraBlock: 'Extra content block',
  truncated: '… truncated, {total} characters total',
  referenceSummary: 'Referenced session · {labels}',
  referenceSeparator: ', ',
}

/** Dictionaries keyed by built-in locale id. */
export const DICTS = { zh, en }
