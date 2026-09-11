/**
 * Reconnaissance run: boot the shell, then report what the plugin system and
 * the composer actually look like, so the interaction script can be written
 * against the real DOM instead of guesses.
 *
 * Usage: node verify/recon.mjs <tokenised-url>
 */
import { launchChrome, sleep } from './cdp.mjs'

const url = process.argv[2]
const { page, kill } = await launchChrome(9333)

const PROBE = `(() => {
  const boot = window.__DSH_BOOT__ ?? {}
  const batches = (boot.batches ?? []).map((b) => b.id ?? b.url ?? Object.keys(b).join('|'))
  const entries = (boot.entries ?? []).map((e) => e.id ?? Object.keys(e).join('|'))
  const editor = document.querySelector('[data-lexical-editor="true"]')
  const heroText = [...document.querySelectorAll('button, [role="button"]')]
    .map((el) => (el.innerText || el.getAttribute('aria-label') || '').trim())
    .filter((t) => t.length > 0 && t.length < 40)
    .slice(0, 40)
  return {
    title: document.title,
    bootKeys: Object.keys(boot),
    batches,
    entries,
    styleTag: !!document.querySelector('style[data-plugin-css="dsh-latex-preview"]'),
    editor: editor ? { tag: editor.tagName, children: editor.children.length } : null,
    editorParentHtml: editor ? editor.parentElement.outerHTML.slice(0, 500) : null,
    bodyText: (document.body.innerText || '').slice(0, 600),
    buttons: heroText,
    lang: document.documentElement.lang,
  }
})()`

try {
  await page.send('Page.navigate', { url })
  await sleep(2000)
  await page.waitFor('window.__DSH_BOOT__ !== undefined', 'the boot graph')
  await sleep(3000)
  const probe = await page.eval(PROBE)
  console.log(JSON.stringify(probe, null, 2))
  const errors = page.consoleErrors(/.*/)
  if (errors.length > 0) console.log('\nCONSOLE ERRORS:\n' + errors.slice(0, 20).join('\n'))
} catch (error) {
  console.error('recon failed:', error.message)
} finally {
  kill()
}
