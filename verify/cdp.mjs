/**
 * Shared CDP plumbing for the verification runs.
 *
 * Chrome is driven over CDP through Node's built-in WebSocket, so verifying the
 * plugin needs no browser-automation dependency.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const root = join(here, '..')
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait for an HTTP endpoint to answer with JSON. */
export async function waitForHttp(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      // Not up yet.
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${url}`)
}

/** Minimal CDP session over one WebSocket. */
export class Session {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.events = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id)
        if (entry === undefined) return
        this.pending.delete(message.id)
        if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)))
        else entry.resolve(message.result)
        return
      }
      this.events.push(message)
    })
  }

  send(method, params = {}) {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Evaluate an expression in the page and return its value. */
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails !== undefined) {
      throw new Error(`page exception: ${result.exceptionDetails.exception?.description ?? 'unknown'}`)
    }
    return result.result.value
  }

  /** Poll an expression until it is truthy. */
  async waitFor(expression, label, attempts = 100) {
    for (let i = 0; i < attempts; i += 1) {
      if (await this.eval(expression)) return true
      await sleep(250)
    }
    throw new Error(`timed out waiting for ${label}`)
  }

  /** Console errors the page logged, filtered by a pattern. */
  consoleErrors(pattern) {
    return this.events
      .filter((event) => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
      .map((event) => event.params.entry.text)
      .filter((text) => pattern.test(text))
  }

  /**
   * Click an element the way a pointer would, rather than through `.click()`.
   * React menus and popovers commonly key off real pointer events.
   * @param {string} selector - CSS selector for the target.
   * @returns {Promise<boolean>} whether the element was found and clicked.
   */
  async click(selector) {
    const rect = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (el === null) return null
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()`)
    if (rect === null) return false
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type,
        x: rect.x,
        y: rect.y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      })
      await sleep(40)
    }
    return true
  }

  /**
   * Click the first visible button whose text matches.
   * @param {RegExp} pattern - label pattern.
   * @returns {Promise<string | null>} the clicked label, or null.
   */
  async clickButton(pattern) {
    const label = await this.eval(`(() => {
      const el = [...document.querySelectorAll('button, [role="button"], [role="option"], [role="menuitem"]')]
        .find((node) => ${pattern}.test((node.innerText || node.getAttribute('aria-label') || '').trim()) && node.offsetHeight > 0)
      if (el === undefined) return null
      el.setAttribute('data-verify-target', '')
      return (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60)
    })()`)
    if (label === null) return null
    await this.click('[data-verify-target]')
    await this.eval(`document.querySelector('[data-verify-target]')?.removeAttribute('data-verify-target')`)
    return label
  }
}

/**
 * Launch headless Chrome and attach to a fresh page.
 * @param {number} debugPort - remote debugging port.
 * @param {number} width - viewport width.
 * @param {number} height - viewport height.
 * @returns {Promise<{page: Session, kill: () => void}>} the attached page and a disposer.
 */
export async function launchChrome(debugPort, width = 1440, height = 1000) {
  const profileDir = join(root, '.chrome-verify')
  mkdirSync(profileDir, { recursive: true })
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      // Chrome's own sandbox cannot initialise inside the harness sandbox, and
      // its crash reporter writes outside the workspace; both are disabled.
      '--no-sandbox',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--disable-breakpad',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`)
  // Chrome 111+ requires PUT for /json/new.
  let target = null
  for (let i = 0; i < 40 && target === null; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })
      if (response.ok) target = await response.json()
    } catch {
      // Not up yet.
    }
    if (target === null) await sleep(250)
  }
  if (target === null) throw new Error('could not open a CDP page target')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const page = new Session(socket)
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  // A headless page is not treated as focused, and unfocused pages drop
  // synthesized input; this makes the renderer always believe it has focus.
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  return { page, kill: () => chrome.kill('SIGKILL') }
}
