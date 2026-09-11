/**
 * Preview stylesheet.
 *
 * Direction: the panel is a *proof of the message*, not a formula widget — so
 * the draft is set as running text with math typeset inline, and the formula
 * under the caret is lifted into a bench above it that pairs the render with
 * the exact source being sent.
 *
 * This sheet follows `docs/web-styling.md`:
 *
 *  - every colour is a `--dsw-alias-*` semantic token; no literal colours, and
 *    no theme branches (light/dark belongs to `ui-theme`);
 *  - the panel is an elevated surface, so it carries `border: 0` plus an
 *    elevation shadow rather than pairing a border with one — the composer's
 *    own `--dsw-elevation-soft`, because this panel sits in the composer stack;
 *  - neutral separators drawn with `--dsw-alias-border-*` are `0.5px` hairlines;
 *  - full-round radii pair `corner-shape: round` so the shell's superellipse
 *    smoothing keeps capsules and dots circular;
 *  - the vendored KaTeX sheet is scoped under `.lp-scope`, a marker class both
 *    the composer dock and the transcript bubble carry, so typeset math looks
 *    identical in both;
 *  - scrollbars are left to the theme's shared rules; no component-specific
 *    scrollbar selectors;
 *  - controls (`Tag`, `Button`, `Tooltip`, `Switch`) come from `ui-primitives`,
 *    so none of their styling is restated here.
 *
 * The one deliberate exception is the bench rail: it is a 2px accent marker in
 * `--dsw-alias-state-business-primary`, not a neutral separator, and carries the
 * plugin's identity rather than a boundary. The hairline rule governs neutral
 * borders.
 */

export const CSS = `
/* ---- frame: shares the composer card's measure so it lines up exactly ---- */
.lp-root{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto;flex:none;color:var(--dsw-alias-label-primary);font-family:inherit}
.lp-root *,.lp-root *::before,.lp-root *::after{box-sizing:border-box}

.lp-card{display:flex;flex-direction:column;min-height:0;overflow:hidden;border:0;border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft)}
.lp-enter{animation:lp-in .16s ease-out both}
@keyframes lp-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

/* ---- head strip ---- */
.lp-head{display:flex;align-items:center;gap:8px;flex:none;height:30px;padding:0 6px 0 10px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.lp-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-state-business-primary);font-family:LPKaTeX_Main,"Times New Roman",serif;font-style:italic;font-size:13px;line-height:1;font-weight:600}
.lp-title{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}
.lp-count{flex:none;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}
.lp-chip{flex:none;display:inline-flex;align-items:center}
.lp-action{flex:none;display:inline-flex;align-items:center}
.lp-dot{flex:none;width:3px;height:3px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-border-l3)}
.lp-spacer{flex:1 1 auto;min-width:8px}

/* ---- body ---- */
.lp-body{position:relative;flex:1 1 auto;min-height:0;max-height:var(--lp-max-height,280px);overflow-y:auto;overscroll-behavior:contain;padding:8px 10px 10px}

/* ---- focus bench: the formula under the caret, render over source ---- */
.lp-bench{position:relative;margin:0 0 10px;padding:7px 10px 8px 12px;border-radius:8px;background:var(--dsw-alias-state-business-tertiary);overflow:hidden}
.lp-bench::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--dsw-alias-state-business-primary)}
.lp-bench-bad{background:var(--dsw-alias-interactive-bg-hover-danger)}
.lp-bench-bad::before{background:var(--dsw-alias-state-error-primary)}
.lp-bench-head{display:flex;align-items:center;gap:6px;margin-bottom:2px}
.lp-bench-tag{flex:none;color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;letter-spacing:.06em;text-transform:uppercase}
.lp-bench-ok{flex:none;color:var(--dsw-alias-state-success-primary);font-size:10px;line-height:14px}
.lp-bench-fail{flex:none;color:var(--dsw-alias-state-error-primary);font-size:10px;line-height:14px}
.lp-bench-stage{overflow-x:auto;overflow-y:hidden;padding:2px 0 3px}
.lp-bench-stage .katex{font-size:1.5em}
.lp-bench-stage .katex-display{margin:0;text-align:left}
.lp-bench-stage .katex-display>.katex{text-align:left}
.lp-bench-src{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-all}
.lp-bench-src-bad{margin-top:2px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:17px}
.lp-bench-detail{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:10.5px;line-height:15px;word-break:break-word}

/* ---- the proof: the draft as the transcript will set it ---- */
.lp-doc{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);word-break:break-word}
.lp-para{margin:0 0 6px;white-space:pre-wrap}
.lp-para:last-child{margin-bottom:0}
.lp-display{margin:2px 0 8px;padding:2px 0;overflow-x:auto;overflow-y:hidden;text-align:center}
.lp-display:last-child{margin-bottom:0}
.lp-tag{position:relative;border-radius:4px;transition:background .12s ease}
.lp-tag-active{background:var(--dsw-alias-interactive-bg-hover-accent)}
.lp-tag-bad{background:var(--dsw-alias-interactive-bg-hover-danger);box-shadow:inset 0 -1px 0 var(--dsw-alias-state-error-primary)}
.lp-flagged::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:repeating-linear-gradient(90deg,var(--dsw-alias-state-warn-primary) 0 3px,transparent 3px 6px)}
.lp-broken{color:var(--dsw-alias-state-error-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px}
.lp-note{margin:6px 0 0;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}

/* ---- collapsed strip ---- */
.lp-strip{display:flex;align-items:center;gap:8px;width:100%;height:26px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:16px;text-align:left;cursor:pointer}
.lp-strip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.lp-strip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}

/* ---- settings section ---- */
.lp-set{display:flex;flex-direction:column;gap:14px;padding:2px 0 8px;max-width:560px}
.lp-set-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.lp-set-row{display:flex;align-items:flex-start;gap:12px}
.lp-set-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.lp-set-label{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.lp-set-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.lp-set-choices{flex:none;display:inline-flex;align-items:center;gap:6px}

/* ---- the user's own message, bubble reproduced from the shell's own sheet ----
   Values mirror ui-chat's MessageItem/MessageIconActions modules so a message
   typeset here sits in the identical bubble; only the math is new. */
.lp-user-row{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.lp-user-stack{display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%)}
.lp-bubble{max-width:100%;padding:10px 16px;border-radius:22px;background:var(--dsw-specific-bubble);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;word-break:break-word}
/* KaTeX positions its own glyphs and must not inherit the bubble's pre-wrap. */
.lp-bubble .katex{white-space:normal}
.lp-sent-display{display:block;margin:4px 0;text-align:center;white-space:normal}
.lp-ref-summary{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px))}
.lp-attach-row{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:100%}
.lp-file-card{display:inline-flex;align-items:center;gap:10px;box-sizing:border-box;flex:0 0 240px;width:240px;min-height:64px;padding:8px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-specific-input-major,transparent)}
.lp-file-icon{flex:none;width:28px;height:28px}
.lp-file-content{display:flex;flex-direction:column;flex:1;min-width:0}
.lp-file-name{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.lp-file-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.lp-actions{display:flex;align-items:center;gap:8px;height:calc(28px + var(--dsh-content-font-delta,0px));opacity:0;transition:opacity 80ms}
.lp-user-row:hover .lp-actions,.lp-actions:focus-within{opacity:1}
.lp-time{padding-right:12px;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:nowrap}
.lp-action{display:inline-flex;align-items:center;justify-content:center;width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));padding:6px;border:0;border-radius:28px;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.lp-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.lp-action:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.lp-sent-display .lp-broken{display:inline-block;white-space:pre-wrap;text-align:left}

@media (prefers-reduced-motion: reduce){
  .lp-enter{animation:none}
  .lp-tag{transition:none}
  .lp-actions{transition:none}
}
`
