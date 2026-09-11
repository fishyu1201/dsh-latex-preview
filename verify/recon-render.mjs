/**
 * Compare how the shell renders one assistant message, with and without the
 * plugin installed.
 *
 * Opens the seeded session, finds the message containing a chosen marker, and
 * reports the DOM facts that distinguish "markdown rendered" from "dumped as
 * literal text": whether the visible text still carries raw `##` / `**` / `$$`,
 * how many KaTeX trees exist, and whether the message ends in a code block.
 *
 * Usage: node verify/recon-render.mjs <tokenised-url> <marker>
 */
import { launchChrome, sleep } from './cdp.mjs'

const url = process.argv[2]
const marker = process.argv[3] ?? '分解法计算'
const label = process.argv[4] ?? 'run'
const { page, kill } = await launchChrome(9343)

try {
  await page.send('Page.navigate', { url })
  await page.waitFor('window.__DSH_BOOT__ !== undefined', 'the boot graph')
  await sleep(2500)
  for (let round = 0; round < 5; round += 1) {
    await sleep(1500)
    if (!(await page.eval(`document.querySelector('[role="dialog"][aria-modal="true"]') !== null`))) break
    if ((await page.clickButton(/稍后配置|Configure later|继续|Continue/)) === null) break
  }
  await sleep(1500)

  // Open the seeded session from the sidebar. The row carries the session title
  // plus a relative-time label, so match on the title inside the session list.
  const opened = await page.eval(`(() => {
    const wanted = ${JSON.stringify(process.env.VERIFY_SESSION_TITLE ?? 'deepseek')}
    // The composer's workspace picker also reads "deepseek", so the search is
    // scoped to the sidebar; otherwise the click opens the workspace menu.
    const sidebar = document.querySelector('[data-slot="sidebar"]') ?? document.body
    const rows = [...sidebar.querySelectorAll('button, [role="button"], a, li')]
      .filter((el) => el.offsetHeight > 0)
      .filter((el) => (el.innerText || '').trim().startsWith(wanted))
    if (rows.length === 0) return { clicked: false, candidates: [...document.querySelectorAll('button, [role="button"], a, li')].filter(e=>e.offsetHeight>0).map(e=>(e.innerText||'').trim().slice(0,40)).filter(Boolean).slice(0,25) }
    rows[rows.length - 1].click()
    return { clicked: true, label: (rows[0].innerText || '').trim().slice(0, 40) }
  })()`)
  console.log(`[${label}] open session:`, JSON.stringify(opened))
  await sleep(5000)

  const report = await page.eval(`(() => {
    const marker = ${JSON.stringify(marker)}
    // Find the element whose text contains the marker and is deepest.
    let hit = null
    for (const el of document.querySelectorAll('div, p, section, article')) {
      if ((el.innerText || '').includes(marker) && el.querySelectorAll('div, p').length < 60) hit = el
    }
    if (hit === null) return { found: false }
    const text = hit.innerText || ''
    return {
      found: true,
      hasRawHeading: /(^|\\n)#{2,}\\s/.test(text),
      hasRawBold: /\\*\\*[^*\\n]+\\*\\*/.test(text),
      hasRawDisplayDollar: text.includes('$$'),
      katexCount: hit.querySelectorAll('.katex').length,
      katexErrors: hit.querySelectorAll('.katex-error').length,
      codeBlocks: hit.querySelectorAll('pre').length,
      // A message dumped as literal text ends up inside one giant <pre>.
      endsInPre: (() => {
        const pres = [...hit.querySelectorAll('pre')]
        return pres.some((p) => (p.innerText || '').includes('关于图中解法'))
      })(),
      sample: text.slice(0, 220).replace(/\\n/g, ' | '),
      length: text.length,
    }
  })()`)
  console.log(`[${label}]`, JSON.stringify(report, null, 2))

  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync(`/tmp/render-${label}.png`, Buffer.from(shot.data, 'base64'))
  console.log(`[${label}] screenshot: /tmp/render-${label}.png`)
} catch (error) {
  console.error(`[${label}] failed:`, error.message)
} finally {
  kill()
}
