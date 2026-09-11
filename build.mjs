/**
 * Bundle the browser half into the single `client.js` the harness serves.
 *
 * The output is wrapped in the client module-loader envelope every web plugin
 * uses; `react` and `react/jsx-runtime` stay external and resolve through the
 * loader's static module table, so the plugin shares the shell's React instance
 * instead of shipping a second copy.
 *
 * Run: node build.mjs [--dev]
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dev = process.argv.includes('--dev')

const HEADER = `window.__ModuleLoader__.load({
  id: 'dsh-latex-preview',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
`

const FOOTER = `
    return module.exports;
  },
});
`

await build({
  absWorkingDir: here,
  entryPoints: [join(here, 'src', 'client', 'index.js')],
  outfile: join(here, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome111', 'firefox113', 'safari16.4'],
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    // Served from the shell's static module table: the plugin reuses the shell's
    // own controls rather than shipping a second copy. Mirrored in
    // `dsh.client.external` so the composition can see the request.
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  minify: !dev,
  sourcemap: true,
  legalComments: 'none',
  charset: 'utf8',
  banner: { js: HEADER },
  footer: { js: FOOTER },
  logLevel: 'info',
})

console.log(`build: client.js written${dev ? ' (development)' : ''}`)
