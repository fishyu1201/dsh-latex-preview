/**
 * dsh-latex-preview — host half.
 *
 * The plugin's whole surface is browser-side: it reads the composer draft and
 * renders it. This half exists so the loader row resolves to a real package and
 * so `dsh.client` is discovered and its `./client` bundle served to the web app.
 * It registers nothing model-facing and changes no request.
 */

export const name = 'dsh-latex-preview'

export const inject = []

/**
 * Mount the host half.
 * @param {object} ctx - host plugin context.
 */
export function apply(ctx) {
  ctx.logger?.info?.('[dsh-latex-preview] composer preview mounted (client-only)')
}

export default { name, inject, apply }
