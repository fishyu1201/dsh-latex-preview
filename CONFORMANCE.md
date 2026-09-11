# Conformance with the DeepSeek Harness plugin standards

English | [中文](CONFORMANCE.zh.md)

An audit of `dsh-latex-preview` against the published Harness documentation, the
package manifest schema shipped with the installation, and the in-tree styling
spec. Every line below was checked against a source, not against memory; the
sources are named so the check can be repeated.

Verdict: **conformant on manifests, module loading, controls, localization and
the styling spec**, with three deliberate deviations, each with a stated reason
(see [Deviations](#deviations)).

## Sources

| What | Where |
|---|---|
| Plugin anatomy, forms, `inject`, `ctx.effect` | [docs/user/develop/basic/index.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/user/develop/basic/index.md) |
| Bundle vs profile, install, layer order, git-install rules | [docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/user/develop/basic/publish.md) |
| `dsh.client` scan, boot graph, combo route, bundle contract | [docs/subsystems/client-modules.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/subsystems/client-modules.md) |
| Styling ownership, tokens, component rules | [docs/web-styling.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/web-styling.md) |
| Manifest fields | `@deepseek-ai/dsh-package-manifest` → `DshManifest`, `DshClientManifest` |
| Styling spec internals (elevation, corner-shape) | `@deepseek-ai/dsh-client-ui-theme` |
| Bilingual doc pairing | [docs/i18n/README.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/i18n/README.md) |

## Manifest

`DshManifest` accepts exactly `bundle`, `profile`, `client`, `configTrees`,
`sessionFormatMigration`, and the launcher-owned `moduleFallback`. This package
declares two of them and nothing else:

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "inject": ["@deepseek-ai/dsh-client-ui-conversation", "…"],
    "external": ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"]
  }
}
```

| Field | Rule | Status |
|---|---|---|
| `dsh.bundle.patch` | patch path relative to the package root | ✅ `./cordis.patch.yml` |
| `dsh.client.platform` | `web` for this consumer | ✅ |
| `dsh.client.inject` | *informational* package-name dependencies — explicitly **not** Cordis service injection | ✅ declares the rows whose slots it fills |
| `dsh.client.external` | exact module-table requests beyond the implicit baseline, no self-reference | ✅ three specifiers; matches what the built bundle actually `require`s (asserted by a test) |
| `exports["./client"]` | required whenever `dsh.client` is declared | ✅ `./client.js` |
| no unknown keys | a malformed declaration fails the scan loudly | ✅ no invented fields |

`cordis.patch.yml` inserts one row by **package name**, which is what makes the
package installable as a bundle —
`docs/user/develop/basic/publish.md` is explicit that rows in a shipped patch
"reference the package by name instead of a relative source path so Node
resolution finds the installed code".

The plugin is nonetheless *installed* through the profile's own patch layer with
an absolute path, the form `docs/user/develop/basic/index.md` gives for a local
plugin. Two measured facts decide it, both verified against a running server:

- `patchReload: live` watches **patch files**. `dsh plugin add` writes the
  profile's bundle list in `package.json`, which is read only at boot — a running
  `dsh web` never picks it up.
- The two forms **cannot coexist**. A bundle row plus the profile insert yield two
  loader entries with the same id, and cordis aborts the boot with
  `duplicate loader entry id: dsh-latex-preview`.

Preferring the local form costs nothing in conformance — both are documented —
and buys a plugin that applies to a running server.

## Plugin form and lifecycle

Documented forms are function, object, and class. The host half is the object
form with a named function, the shape the docs use for a plugin that provides no
service:

```js
export const name = 'dsh-latex-preview'
export const inject = []
export function apply(ctx) { … }
export default { name, inject, apply }
```

- ✅ **No manual cleanup.** The one resource that outlives a render — the injected
  `<style>` element — is released through `ctx.effect`, the documented mechanism.
- ✅ **Declared dependencies.** The client half declares `inject = ['slots', 'locale']`,
  so the framework waits for both services before `apply` runs.
- ✅ **Namespaced logging.** The host half logs through `ctx.logger`.

## Client module contract

`docs/subsystems/client-modules.md`: "Entry name == package name", the bundle is
`exports["./client"]`, and the browser loads it through the module-loader
envelope.

- ✅ Envelope id is `dsh-latex-preview`, the package name.
- ✅ One exported face: `apply` + `inject` (`default` too, matching every shipped
  client package).
- ✅ Everything the bundle requests is either a static-table module or its own
  code. There is no second React, no bundled copy of a shared control, and no
  network request at runtime.
- ✅ The plugin contributes to slots it declares a dependency on —
  `conversation.input.dock`, `settings.section`, and the keyed
  `conversation.chat.node` for the `user` and `steering` kinds — and reads only
  the documented `InputState.draft` through the standard `useInput` selector hook.
- ✅ The one document-level listener (copy-as-LaTeX) is installed inside
  `ctx.effect`, so it is released with the plugin rather than leaking.
- ✅ Taking the `user` key is the documented behaviour of a keyed slot ("reusing a
  key replaces that node renderer"); see the note under [Deviations](#deviations)
  for what that costs.

## Styling spec

`docs/web-styling.md` states its rules as checkable constraints. Each is either
satisfied or listed under [Deviations](#deviations).

| Rule | Status |
|---|---|
| Use `--dsw-alias-*` semantic tokens; no literal colours | ✅ no literal colour remains; the audit removed the one `#fff` |
| No theme selectors or light/dark branches in feature CSS | ✅ none |
| Elevated surfaces take `border: 0` plus an elevation shadow; never a border **and** an lv shadow | ✅ the panel is `border: 0` + `var(--dsw-elevation-soft)`, the composer's own elevation |
| Neutral `--dsw-alias-border-*` separators draw at `0.5px` | ✅ head seam and collapsed strip are `0.5px` |
| Pair `corner-shape: round` with every full-round radius | ✅ the status dot pairs it; the pill-shaped controls moved to `ui-primitives`, which owns their radii |
| Reuse the control before restyling one — the `ui-primitives` catalogue is the only channel that crosses feature packages | ✅ `Tag`, `Button`, `Tooltip`, `Switch` and the chevron icons are imported from it; the hand-rolled switch, segmented control, buttons, chips and inline SVG were all deleted |
| Keep component-specific scrollbar selectors out; use the shared styles | ✅ the theme styles scrollbars globally, so the local overrides were deleted |
| Pair font sizes with line heights | ✅ every `font-size` in the sheet carries a `line-height` |
| Presentation in CSS; inline styles may carry component-local custom-property values but must not encode theme branches | ✅ the one inline style passes `--lp-max-height`, a layout value |
| Preserve keyboard focus visibility and reduced motion | ✅ `:focus-visible` outlines on the strip; the entrance animation and the formula tint transition both stand down under `prefers-reduced-motion` |

One deliberate reading of the hairline rule: the bench rail is a **2px accent
marker** in `--dsw-alias-state-business-primary`, not a neutral separator. The
rule governs "flat borders and separators that use a neutral
`--dsw-alias-border-*` token", and the rail is neither flat nor neutral — it is
the panel's identity mark.

## Localization

`docs/i18n` plus the locale seat every shipped client package uses.

- ✅ Dictionaries register through `ctx.locale.register(NS, { zh, en })`, both
  locales in one call, and a test asserts the two key sets are identical — the
  registry rejects an unbalanced pair.
- ✅ Both slot entries declare `locale: NS`, so the framework injects the bound
  `t` and switching language repaints the panel through the shared seat.
- ✅ Slot `label`s resolve through `t` rather than a literal.
- ✅ No module reads `document.documentElement.lang`; the hand-rolled i18n module
  was deleted.
- ✅ READMEs are a bilingual pair with reciprocal switchers, as
  `docs/i18n/README.md` requires.

## Deviations

Three, each a deliberate trade rather than an oversight.

### 1. Preferences live in `localStorage`, not the durable settings namespace

The documented path for feature preferences is a Host-registered settings
namespace read through `ctx.settingsScope.bind({ namespace })`. That registration
requires a `@deepseek-ai/schemastery` schema (`SettingsProvider.register(ns, schema)`),
and `@deepseek-ai/schemastery` is not resolvable from an out-of-tree package whose
source lives outside the profile — the profile's `node_modules` does not carry it,
and the loader resolves a package's imports from that package's own location.

The only way to get one is to declare `@deepseek-ai/schemastery` as this package's
own dependency. That risks a **second schemastery instance**, which
`settings.register` would not recognise as its own schema — failing the entire
plugin at load rather than just its three switches.

These are presentational preferences for a preview panel. Trading a working panel
for durable storage of `{enabled, bench, maxHeight}` is the wrong way round, so the
plugin keeps a local, browser-scoped store and says so in `prefs.js`.

### 2. No CSS Modules

`docs/web-styling.md` asks feature components to use CSS Modules. Those are
compiled by the monorepo's Vite pipeline; this package is a single browser bundle
built by esbuild that the shell loads through the module-loader envelope, and it
has no CSS pipeline of its own.

The isolation the rule exists to provide is achieved a different way: every
selector is prefixed and the whole sheet is scoped under the stable `.lp-root`
class, and a test asserts it. A stable root class is required regardless — the
vendored KaTeX sheet (363 KB, 20 embedded woff2 faces) is scoped under that same
class and cannot live under a hashed name.

### 3. No `clsx`

`clsx` is not in the shell's static module table, so a client bundle can only get
it by bundling a copy. The class lists here are three or four entries long and are
built with `.filter(Boolean).join(' ')`; adding a dependency to reimplement that
would be worse than the rule it satisfies.

### 4. Taking over the user message row

Not a spec deviation — `conversation.chat.node` is a keyed slot and the docs say
plainly that reusing a key replaces that renderer — but it is the largest thing
this plugin does, so it is recorded here.

There is no way to typeset the text while leaving the shipped bubble in place: the
slot is all-or-nothing. Rather than fork the shell's message UI, the renderer
reproduces it from the same sources a fork would have to guess at — the shell's own
stylesheet values (`userRow`, `userStack`, `bubble`, the attachment cards, the
action row) and its exported primitives (`projectUserText` for the command and
file chips, `FileTypeIcon`, `fileExtension`, `fileSizeText`, `JsonBlock`,
`writeClipboard`). A message with no math therefore renders the same tree as
before, and the source stays the single source of truth: the message-level copy
action still hands over the original text, and the model payload was never
involved.

The cost is real and stated: if a future Harness release adds UI to user messages,
this renderer will not inherit it.

## Marketplace listing

Prepared against the
[awesome-dsh-plugin contributing guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md),
which is the catalogue the DSH plugin market reads.

| Requirement | Status |
|---|---|
| `package.json` declares `dsh.bundle` | ✅ plus `dsh.client.platform: web` |
| `cordis.patch.yml` beside it, row by package name | ✅ |
| Real, working code | ✅ 57 tests; a fresh clone installs, boots and passes the browser run |
| `dsh-plugin` topic on the repo | ⏳ set on GitHub after the first push |
| Repo at least 1 day old | ⏳ satisfied by the repo's own age |
| Description states what it does, no superlatives | ✅ one line, every claim mapped to a verified behaviour |
| Category matches what it does | ✅ `ui` — composer and transcript presentation |
| Official `@deepseek-ai/*` as `peerDependencies`, not `dependencies` | ✅ none in `dependencies`; peers are optional with prerelease-bearing ranges |
| Not a meta-package | ✅ ships its own behaviour |

Two notes on the packaging, both deliberate:

- **The built `client.js` is committed.** The guide recommends npm or a release
  tarball so a git install skips pnpm's `allowBuilds` approval. Committing the
  build reaches the same end directly: `dsh plugin add github:…` runs no build
  step, so there is nothing to approve. A tarball would add a release artifact to
  keep in sync for no additional benefit, so there is none.
- **`dsh.plugin.json` was removed.** The package shipped one; nothing reads it —
  not the Harness loader, not the market. The manifest contract is `package.json#dsh`,
  and `@deepseek-ai/dsh-package-manifest` accepts no such key.

## Not applicable

Checked and deliberately absent, so a later reviewer does not read the omission as
an oversight:

- **`README.i18n.yaml`.** This is the monorepo's translation-pairing record: three
  sibling files carrying the full git blob hash of each side, enforced by
  `pnpm run verify-translation-pairing` over `docs/**` and every non-vendor
  README. The hashes are meaningless outside that repository and the gate does not
  run on this package.
- **A `./invariant` companion.** `@deepseek-ai/dsh-invariants` is for packages that
  own "durable relationships (authoritative event streams and mutable snapshots)".
  This plugin owns no durable state: it reads a draft and renders it.
- **`dsh.client.immediately`.** It marks the stage-one prefetch barrier for a row
  whose factory must register early. The preview is lazy chrome and does not need
  it.
- **`dsh.compatibility`.** Not a field in `DshManifest`. A sibling LaTeX plugin
  installed in this profile declares it; the schema ignores unknown keys, so it is
  inert rather than harmful — but it is not part of the contract.

## Verification

The claims above are enforced, not asserted:

```sh
npm test        # 40 tests
```

- the built bundle's real `require` calls equal `dsh.client.external`, so the
  manifest cannot drift from the code;
- both dictionaries register with identical key sets;
- both slot entries carry `locale: 'latex-preview'`;
- the rendered dock contains `ui-primitives` output (`data-tone`, the stub button)
  and contains **no** hand-rolled switch or segmented control.

```sh
node verify/drive.mjs '<tokenised-url>'
```

Drives the real shell in headless Chrome and, in the last run, reported zero
failures across: the plugin appearing in the client module graph, four formulas
typesetting with one display block, the caret bench tracking the caret, a
malformed formula flagged before send, the collapse strip, the settings section,
a hovered chip producing the shell's own `role="tooltip"` bubble — and the draft
the model would receive being byte-identical to what was typed.
