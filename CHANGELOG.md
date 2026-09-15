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
