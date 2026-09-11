/**
 * Install / uninstall the preview in the running web profile.
 *
 * The plugin lives in this directory and is referenced by absolute path from the
 * profile's own patch layer, so the profile needs no dependency install and the
 * source stays wherever you keep it.
 *
 * This is the form to use for a plugin you keep in a working tree, for two
 * measured reasons:
 *
 *  - `patchReload: live` watches patch files, so the row takes effect without
 *    restarting `dsh web`. Adding the package as a profile *bundle* instead
 *    (`dsh plugin add`) does not: that list is read only at boot.
 *  - The two forms are mutually exclusive. A bundle row plus this insert produce
 *    two loader entries with the same id, and cordis refuses to boot:
 *    "duplicate loader entry id". Pick one — this one, for a local checkout.
 *
 * Usage:
 *   node scripts/install.mjs            # add the row
 *   node scripts/install.mjs --remove   # take it back out
 *   node scripts/install.mjs --check    # report what is installed
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const entry = join(packageRoot, 'src', 'index.mjs')

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileName = process.env.DSH_PROFILE ?? 'web'
const patchPath = join(dshHome, 'profiles', profileName, 'cordis.patch.yml')
const backupPath = `${patchPath}.before-latex-preview`

const ROW_ID = 'dsh-latex-preview'
const MARKER = '# ── dsh-latex-preview'
const BLOCK = `${MARKER} ─────────────────────────────────────────────────────
# Live LaTeX preview in the composer: typeset while you type, raw source on send.
# Source: ${packageRoot}
# Re-run scripts/install.mjs --remove to take this out again.
- insert:
    - id: ${ROW_ID}
      name: '${entry}'
`

const mode = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--check') ? 'check' : 'install'

if (!existsSync(patchPath)) {
  console.error(`install: no patch layer at ${patchPath} — is the "${profileName}" profile initialised?`)
  process.exit(1)
}

const original = readFileSync(patchPath, 'utf8')
const installed = original.includes(MARKER)

if (mode === 'check') {
  console.log(`install: profile   ${patchPath}`)
  console.log(`install: entry     ${entry}`)
  console.log(`install: status    ${installed ? 'installed' : 'not installed'}`)
  process.exit(0)
}

if (mode === 'remove') {
  if (!installed) {
    console.log('install: nothing to remove')
    process.exit(0)
  }
  const next = original.replace(new RegExp(`\\n?${MARKER}[\\s\\S]*?(?=\\n[^\\s#]|\\n*$)`), '\n')
  writeFileSync(patchPath, next, 'utf8')
  console.log(`install: removed the ${ROW_ID} row from ${patchPath}`)
  process.exit(0)
}

if (installed) {
  console.log(`install: already installed in ${patchPath}`)
  process.exit(0)
}

if (!existsSync(backupPath)) writeFileSync(backupPath, original, 'utf8')

// The template ships an empty flow-sequence root (`[]`); a real entry list
// replaces it. Any other content is preserved and appended to.
const seeded = original.replace(/^\s*\[\s*\]\s*$/m, '').replace(/\s*$/, '\n')
const next = `${seeded}\n${BLOCK}`

writeFileSync(patchPath, next, 'utf8')
console.log(`install: added the ${ROW_ID} row to ${patchPath}`)
console.log(`install: backup at ${backupPath}`)
console.log('install: the web profile reloads patch files live — no restart needed')
