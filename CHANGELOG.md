# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## Unreleased

### Build System

- upgrade `vitest` from 0.29.8 to 5.0.1

  The devDependency jumps five major lines (`^0.29.8` → `^5.0.1`,
  registry latest). The move is not a drop-in one and drags the whole
  Vite toolchain along:

  - `@vitest/ui` moves from `^0.22.1` to `^5.0.1`. Vitest enforces an
    exact-version peer (`'@vitest/ui': '5.0.1'`), so both packages
    must stay in lockstep from now on; the ancient 0.22 UI would fail
    peer resolution outright.
  - `@vitest/coverage-c8` (`^0.29.8`) is removed and replaced by
    `@vitest/coverage-v8@^5.0.1`. The `c8` provider was deprecated at
    vitest 0.34 and its package stopped receiving releases (final
    0.33.0); vitest ≥1 only auto-detects the `v8` (or `istanbul`)
    providers. `npm run coverage` (`vitest run --coverage`) keeps
    working unchanged and now reports through the v8 provider backed
    by `ast-v8-to-istanbul`.
  - `vite` moves from `^3.0.7` to `^8.3.0` (registry latest) because
    vitest 5 declares the non-optional peer
    `vite: ^6.4.0 || ^7.0.0 || ^8.0.0` — the old vite 3 cannot satisfy
    it. Consequences of the vite 3 → 8 jump:
    - Vitest now runs on vite 8's Rolldown/Oxc pipeline (rolldown
      1.2.x, lightningcss instead of esbuild), which speeds up test
      transforms (35 tests ≈ 350 ms).
    - `npm run dev` boots the demo app on the vite 8 dev server.
    - vite 8 no longer depends on esbuild directly (its remaining
      esbuild peer is optional and unmet), so the stale
      `allowScripts` entry pinning `esbuild@0.14.54` in
      `package.json` is deleted — `npm ls esbuild` is now empty across
      the whole tree.
  - `vite.config.ts` is updated for the vitest 1+ config style: the
    `/// <reference types="vitest" />` triple-slash directive (removed
    in vitest 1.0) is gone and `defineConfig` is imported from
    `vitest/config` instead of `vite`, so the `test.css: true` option
    is type-checked against the real `TestOptions` shape.
  - Node engine floor: vitest 5 requires
    `^22.12.0 || ^24.0.0 || >=26.0.0` and vite 8 requires
    `^20.19.0 || >=22.12.0`. The development environment (Node
    24.20.0) satisfies both.
  - `npm dedupe` was run after the installs; no duplicate copies of
    vite/vitest remain hoisted.
  - Verified after the upgrade: `npm test` (35/35 passing),
    `npm run coverage` (86.54% statements / 77.92% branches, same
    profile as before), `npm run lint`, `npm run build`
    (babel esm + cjs + `tsc` declaration emit), `npm run dev`
    (vite 8), and `vitest --ui` (UI served via `@vitest/ui` 5.0.1).
  - Deliberately not upgraded (not required for compatibility and
    still green): `typescript` 4.8.2, `eslint` 8.23.0 with
    `@typescript-eslint/*` 5.36.1, and `prettier` 2.7.1. Vitest 5
    transpiles TypeScript itself through vite's Oxc pipeline, and the
    repo's own `tsc` run only compiles `src/index.ts` with
    `skipLibCheck`, so the old TypeScript remains functional for the
    declaration build and lint.

- migrate the `codemirror` dependency (5.65.12) to the CodeMirror 6
  ecosystem

  The runtime dependency `codemirror` moves from `^5.65.12` to the
  CodeMirror 6 packages this library actually uses. CodeMirror 6 is a
  ground-up rewrite published under the same npm name, and the new
  `codemirror` package (6.0.2) is only the editor bundle
  (`basicSetup` + re-exports of `@codemirror/{view,state,language,…}`).
  It contains none of the three CodeMirror 5 pieces this headless
  highlighting library was built on — `addon/runmode/runmode.node`,
  the `mode/*` parser files with `mode/meta`, and the `lib/codemirror.css`
  / `theme/*.css` files — so a plain `codemirror@latest` install cannot
  satisfy the library at all. The upgrade therefore lands on the
  CodeMirror 6 packages that provide those capabilities:

  - `codemirror` (5.65.12) is **removed**, together with the dev-only
    `@types/codemirror` (CodeMirror 6 packages ship their own types).
    Keeping the unused editor bundle would drag `@codemirror/view`,
    `autocomplete`, `commands`, `search` and `lint` into every
    installation for no benefit.
  - `@codemirror/language@^6.12.4` is added (runtime dependency). It
    supplies the public `StringStream` and `StreamParser` types
    (dual ESM/CJS builds, so the CJS output can still resolve it) and
    is the CodeMirror 6 counterpart of the parts of CM5's core that
    runmode depended on.
  - `@codemirror/legacy-modes@^6.5.4` is added (runtime dependency).
    This is the official CM5-mode preservation package: each mode is
    the original CodeMirror 5 tokenizer source adapted into a
    `StreamParser`, so token boundaries and CodeMirror 5 style strings
    (`keyword`, `atom`, `number`, `def`, `variable`, `operator`,
    `comment`, `string`, …) are preserved verbatim and all 35 tests
    pass unchanged.

  The fallout was fixed as follows:

  - **Tokenizer port.** `CodeMirror.runMode` no longer exists in
    CodeMirror 6. A faithful port now lives in `src/tags.ts` as the
    private `runMode` helper, written directly against
    `@codemirror/language`'s exported `StringStream` and the legacy
    modes' `StreamParser` interface. It mirrors CM5's
    `addon/runmode/runmode` loop exactly: text is split on
    `/\r?\n|\r/`, parser state is carried across lines via
    `startState(indentUnit)`/`blankLine(state, indentUnit)`, `\n` is
    reported between lines with no style (which is what feeds the
    line-position bookkeeping in `diff`), and every token is reported
    as `(text, style)` with `stream.start` advanced after each token.
    No legacy mode uses the CM5 `StringStream` features that the CM6
    class dropped (`lookAhead`, `hideFirstChars`, `baseToken`), which
    was verified before the port.
  - **Language registry.** `codemirror/mode/meta` (`CodeMirror.modeInfo`,
    157 entries) no longer exists. Its replacement is the new generated
    `src/modes.ts`: the historical CM5 `modeInfo` table (from
    `codemirror@5.65.21`, MIT) mapped onto `@codemirror/legacy-modes`
    modules, with per-entry `{module, export}` resolution for
    multi-export modules (`clike` → `c`/`cpp`/`java`/…, `css` →
    `css`/`less`/`sCSS`/`gss`, `sql` → 9 dialects, `javascript` →
    `javascript`/`json`/`jsonld`/`typescript`, `mllike`, `rpm`,
    `haxe`, `mscgen`, `verilog`, `z80`, …). The `modeMap`/`collisions`
    key derivation in `tags.ts` (aliases first, extensions as
    fallback, collisions removed) is unchanged, so every existing
    language key keeps its meaning; 139 of the 157 entries survive.
    The generator lives at `workspace/src/gen-code-funcs-modes.js` in
    the wrapper repository (regenerate with
    `node workspace/src/gen-code-funcs-modes.js --repo ../code-funcs`).
  - **Language coverage changes.** Fifteen CM5 modes have no
    `@codemirror/legacy-modes` counterpart and are dropped from the
    registry: `markdown`, `gfm`, `php`, `vue`, `django`, `haml`,
    `twig`, `soy`, `slim`, `smarty`, `tornado`, `rst`,
    `htmlembedded` (embedded JavaScript/Ruby/ASP.NET/JSP),
    `haskell-literate` and the `null` plain-text pseudo-mode (which
    had no alias/extension keys and was never reachable through
    `modeMap`). Their CodeMirror 6 successors (`@codemirror/lang-*`)
    are Lezer-based and emit tags rather than CodeMirror 5 style
    strings, which this library's color pipeline cannot consume.
    `HTML` remains but now resolves to the legacy `xml` module's
    `html` parser, which highlights tags/attributes but no longer
    colorizes embedded JavaScript/CSS (CM5's `htmlmixed` sub-mode
    machinery is not part of legacy-modes). `jsx` maps to the legacy
    `javascript` parser and `tsx` to its `typescript` parser; JSX/TSX
    markup itself is no longer tokenized as embedded XML the way
    CM5's `jsx` mode did it (plain TS/JS tokenization only).
  - **Theme pipeline preserved via vendored CSS.** CodeMirror 6 has no
    CSS theme files, so the entire theme feature (parse `{theme}`
    option, `ready({themes})`, `.cm-s-<theme>` CSS parsing through the
    `css` package) is kept alive by vendoring the CodeMirror 5 style
    sheets into the repository: `lib/codemirror.css` becomes
    `src/themes/codemirror.css` (the source of the `default` color
    map) and all 65 `theme/*.css` files ship as `src/themes/<name>.css`
    (nord, material-darker, dracula, … — every theme name the CM5
    package ever provided). `getTheme` now imports
    `./themes/${theme}.css?raw` from the library itself instead of
    reaching into the `codemirror` package. The vendored files are
    excluded from prettier (`.prettierignore`) so they stay verbatim,
    and the `build` script gained an `assets` step that copies
    `src/themes` into both `lib/esm/themes` and `lib/cjs/themes` so
    the published package keeps working with bundler `?raw` imports.
  - **Style-name normalization.** `@codemirror/legacy-modes` renamed
    some CM5 token styles to CM6 tag names on a per-mode basis
    (`string-2` → `string.special`, `variable-2` →
    `variableName.special`, `variable-3`/`variable-2` →
    `variableName.local` depending on the mode, `variable-3` →
    `variableName.constant` in css). Since the `StyleOption` union and
    the vendored theme CSS both speak CM5 class names, `runMode`
    translates the four verified renames back
    (`src/tags.ts` `styleAliases`; each entry was checked against the
    corresponding `codemirror@5` mode source). Without this the
    `/r/g` regexp test fell back to black instead of `#f50`.
  - **Minor fix.** `ready()`'s error for an unknown language said
    `language null not found` (it interpolated the wrong variable);
    it now reports the requested language key.

  Verified after the migration: `npm test` (35/35, unchanged
  expectations), `npm run coverage` (86.79% statements — same profile
  as before), `npm run lint`, `npm run types`, `npm run build`
  (babel esm + cjs + declaration emit + theme assets), and the
  prettier check. The CJS output keeps working the way it did before:
  `@codemirror/language` and `@codemirror/legacy-modes` are dual
  ESM/CJS, dynamic `import()`s of mode modules resolve through the
  `exports` map, while the `?raw` theme imports remain bundler-only
  (unchanged limitation — `ready()` still requires a bundler in the
  same way it did when the CSS came from the `codemirror` package).

- upgrade `prettier` from 2.7.1 to 3.9.6

  The devDependency moves from `^2.7.1` to `^3.9.6` (registry latest,
  the same version the motion-canvas monorepo standardizes on). The
  configured options (`singleQuote`, `printWidth: 80`,
  `trailingComma: all`) carry over unchanged; `trailingComma` even
  became the 3.x default. No companion packages needed updating — the
  repo uses no prettier plugins and nothing else consumes its API.

  The upgrade reformats exactly two files (everything else,
  including `src/modes.ts` and the vendored `src/themes/*.css`
  excluded via `.prettierignore`, is byte-identical):

  - `index.html`: the HTML doctype is now emitted lowercase
    (`<!DOCTYPE html>` → `<!doctype html>`), matching the HTML spec
    and Prettier 3's normalization. No behavioral difference.
  - `src/tags.ts` (one line): Prettier ≥3.6 requires parentheses
    around a `??` expression inside a ternary branch
    (`styleAliases[style] ?? style` →
    `(styleAliases[style] ?? style)`) — the new
    ambiguous-nullish-coalescing disambiguation. Pure formatting; the
    emitted code is identical.

  Verified after the upgrade: `npm test` (35/35), `npm run lint`,
  `npm run types`, `npm run build`, and the prettier check.
  The `husky` pre-commit hook chain is unaffected (it invokes
  `prettier --check`, which passes).

- upgrade `husky` from 8.0.1 to 9.1.7

  The devDependency moves from `^8.0.1` to `^9.1.7` (registry latest).
  Husky 9 makes two breaking changes that both required fixes here; no
  companion packages were involved.

  - `prepare` script: `"husky install"` is deprecated (prints a
    warning and will be removed in husky 10) and is replaced by the
    bare `"husky"` command in `package.json`.
  - Hook files: the `#!/usr/bin/env sh` +
    `. "$(dirname -- "$0")/_/husky.sh"` preamble that every husky ≤8
    hook sourced is gone — husky 9 removes the `husky.sh` shim and
    invokes hooks directly, so `.husky/pre-commit` is now a plain
    executable shell script (shebang kept) running the same four
    commands as before: `npm test`, `npm run lint`,
    `npm run prettier:check`, `npm run build`.
  - The `.husky/_` directory was regenerated by running
    `npm run prepare` after the upgrade; it now contains husky 9's own
    hook shims (`h` dispatches to the hook script, and the deprecated
    `husky.sh` shim is gone). `.husky/_` remains git-ignored (husky 9
    ships a `.gitignore` inside it), and `core.hooksPath=.husky/_` is
    unchanged.

  Verified after the upgrade: `npm run prepare` (installs the v9 shims
  without warnings), `npm test` (35/35), `npm run lint`,
  `npm run prettier:check`, `npm run build` — i.e. exactly the command
  chain the pre-commit hook runs — plus a clean prettier check. The
  first commit made after this change goes through the husky 9 hook
  path end-to-end.

- upgrade `eslint` from 8.23.0 to 10.10.0 and the lint toolchain with it

  ESLint 10 drops eslintrc entirely (flat config only), and the whole
  lint stack moves with it. This mirrors the toolchain the
  motion-canvas monorepo already standardized on (see its
  `eslint.config.mjs` and AGENTS.md "Companion pins"), so the two
  repos now lint the same way:

  - `eslint` `^8.23.0` → `^10.10.0`
  - `@typescript-eslint/eslint-plugin` and `-parser` `^5.36.1` →
    `^8.70.0` (v5 does not support eslint ≥9; v8 declares the peer
    range `^8.57.0 || ^9.0.0 || ^10.0.0`)
  - `eslint-plugin-tsdoc` `^0.2.16` → `^0.5.2` (0.2.x used the old
    eslintrc `RuleTester`/utils and does not work under flat config;
    0.5.x nests its own private `@typescript-eslint/utils@8.56.1` +
    `typescript@5.9.3`, which is isolated and harmless)
  - `@eslint/js@^10.0.1` and `globals@^17.12.0` are added as devDeps —
    flat config references `js.configs.recommended` and the
    browser/es2021 globals explicitly instead of the eslintrc `env`
    block
  - `typescript` `^4.6.4` → `~6.0.3`: typescript-eslint 8.70 declares
    `typescript >=4.8.4 <6.1.0` as its peer, and the repo's resolved
    4.8.2 fell below that floor. 6.0.3 is the newest release inside
    the supported range (7.x, the native-compiler line, is not).

  Config migration (`.eslintrc.cjs` deleted, `eslint.config.mjs`
  added):

  - The rule set is intentionally unchanged: `js.configs.recommended`
    replaces `eslint:recommended`, `tsPlugin.configs['flat/recommended']`
    replaces `plugin:@typescript-eslint/recommended`, and the two
    custom rules (`tsdoc/syntax: error`,
    `no-irregular-whitespace: off`) carry over. Browser + es2021
    globals move from the eslintrc `env` block into
    `languageOptions.globals`. All 7 files under `src/` lint with zero
    errors under the new stack — no code changes were needed.
  - The `lint` script (`eslint ./src/`) is unchanged; flat config is
    discovered from the repo root automatically.

  TypeScript 6 fallout in `tsconfig.json` (surface by the
  `npm run types` declaration build, exit code unchanged but errors
  printed):

  - `"moduleResolution": "Node"` (node10) is deprecated in TS 6
    (TS5107) and removed in TS 7 — replaced with `"bundler"`, the
    correct mode for a library that consumers always import through a
    bundler and whose `?raw` imports only resolve in one anyway.
  - TS 6 additionally requires an explicit `"rootDir"` when the common
    source directory is `./src` (TS5011) — `"rootDir": "./src"` added.
    The declaration output (`lib/types/*.d.ts` + maps) has an
    unchanged layout.

  Verified after the upgrade: `npm run lint` (7 files, zero errors),
  `npm test` (35/35), `npm run types`, `npm run build`,
  `npm run prettier:check`.

- upgrade `@types/wcwidth` from 1.0.0 to 1.0.2

  The devDependency moves from `^1.0.0` to `^1.0.2` (registry latest).
  The runtime `wcwidth` package still ships no types of its own, so the
  `@types` package remains required. No other packages needed updating.

  The new declaration is a drop-in for this repo: it still declares
  `declare function wcwidth(input: string): number` but now uses a
  CommonJS-style `export =` instead of the 1.0.0 declaration style,
  which resolves identically through the `esModuleInterop`-enabled
  default import in `src/tags.ts` (`import wcwidth from 'wcwidth'`,
  used for double-width character accounting in `diff`).

  Verified after the upgrade: `npm test` (35/35), `npm run types`
  (declaration emit), `npm run lint`, `npm run build`, and the
  prettier check.

- upgrade `@types/css` from 0.0.33 to 0.0.38

  The devDependency moves from `^0.0.33` to `^0.0.38` (registry
  latest; five DefinitelyTyped releases, last published Sep 2024).
  The runtime `css` package still ships no types of its own, so the
  `@types` package remains required. No other packages needed
  updating.

  The API this library consumes — `parse()` returning a `Stylesheet`
  with a `stylesheet.rules` tree of `Rule` / `Declaration` nodes, used
  by `getColorMap` to extract token colors from the vendored CodeMirror
  theme CSS — is unchanged in shape, so no code changes were needed.
  The intervening releases are DefinitelyTyped maintenance updates
  (strictness/lint conformance of the declaration file itself).

  Verified after the upgrade: `npm test` (35/35), `npm run types`
  (declaration emit), `npm run lint`, `npm run build`, and the
  prettier check.

- upgrade the `@babel/*` toolchain from 7.18–7.19 to Babel 8

  All four build devDependencies move from their 7.x versions to the
  Babel 8 line (registry latest): `@babel/cli` `^7.18.10` →
  `^8.0.5`, `@babel/core` `^7.19.0` → `^8.0.5`, `@babel/preset-env`
  `^7.19.0` → `^8.0.5`, `@babel/preset-typescript` `^7.18.6` →
  `^8.0.1`. The four are a locked suite (they all peer-depend on the
  same `@babel/core` major), so they move together. No other packages
  needed updating: the babel config files are plain JSON (unaffected
  by Babel 8's config-loading changes) and nothing else in the repo
  consumes `@babel/core` programmatically.

  The build configs are carried over verbatim —
  `babel.esm.config.json` (`@babel/preset-typescript` only, test/d.ts
  files ignored) and `babel.cjs.config.json` (`@babel/preset-env` with
  `modules: "commonjs"` + `targets: "maintained node versions"`, plus
  `@babel/preset-typescript`) both work unmodified on Babel 8; the
  `modules: commonjs` option and the CJS dynamic-import lowering
  (`import()` → `Promise`-wrapped `require` with
  `_interopRequireWildcard`, which the CJS output relies on to resolve
  `@codemirror/legacy-modes/mode/*` and the `?raw` theme imports)
  behave exactly as under Babel 7.

  Verified after the upgrade:

  - `npm run build` compiles both targets (`Successfully compiled 5
files with Babel` for esm and cjs) plus the declaration emit and
    theme assets; the ESM output still loads (`modeInfo` registry:
    139 entries) and the CJS output keeps the same require-interop
    structure as before.
  - The `caniuse-lite is outdated` browserslist warning that the old
    `@babel/preset-env@7.19.0` stack printed on every CJS build is
    gone (Babel 8 ships an up-to-date compat-data/browserslist
    dependency set).
  - `npm test` (35/35), `npm run lint`, `npm run prettier:check` — no
    source changes were required anywhere.
