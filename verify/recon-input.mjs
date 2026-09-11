/**
 * Debug why synthesized input is not reaching the composer.
 *
 * Usage: node verify/recon-input.mjs <tokenised-url>
 */
import { launchChrome, sleep } from './cdp.mjs'

const url = process.argv[2]
const { page, kill } = await launchChrome(9339)

const PROBE = `(() => {
  const all = [...document.querySelectorAll('[data-lexical-editor], [data-composer-input], [contenteditable]')]
  return {
    count: all.length,
    editors: all.map((el) => ({
      tag: el.tagName,
      ce: el.getAttribute('contenteditable'),
      lexical: el.getAttribute('data-lexical-editor'),
      composer: el.getAttribute('data-composer-input'),
      phase: el.getAttribute('data-phase'),
      editable: el.isContentEditable,
      visible: el.getClientRects().length > 0,
      html: el.innerHTML.slice(0, 120),
      text: (el.innerText || el.textContent || '').slice(0, 80),
    })),
    active: document.activeElement ? document.activeElement.tagName + '.' + (document.activeElement.className || '').toString().slice(0, 40) : null,
    hasFocus: document.hasFocus(),
  }
})()`

try {
  await page.send('Page.navigate', { url })
  await page.waitFor('window.__DSH_BOOT__ !== undefined', 'the boot graph')
  await sleep(2000)
  await page.clickButton(/稍后配置|Configure later|继续|Continue/)
  await page.waitFor('document.querySelector(\'[data-lexical-editor="true"]\') !== null', 'the composer', 120)
  await sleep(2000)

  console.log('hasFocus:', await page.eval('document.hasFocus()'))
  console.log('BEFORE:', JSON.stringify(await page.eval(PROBE), null, 2))

  await page.eval(`document.querySelector('[data-lexical-editor="true"]').focus()`)
  await sleep(300)
  await page.send('Input.insertText', { text: 'HELLO $x$' })
  await sleep(1200)
  console.log('AFTER insertText:', JSON.stringify(await page.eval(PROBE), null, 2))

  // Fall back to per-character key events.
  await page.eval(`document.querySelector('[data-lexical-editor="true"]').focus()`)
  await sleep(200)
  for (const ch of 'ABC $y$') {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
  await sleep(1200)
  console.log('AFTER keyEvents:', JSON.stringify(await page.eval(PROBE), null, 2))
} catch (error) {
  console.error('recon failed:', error.stack)
} finally {
  kill()
}
