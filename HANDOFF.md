# Infinite Lo-Fi Handoff

Updated: 2026-09-07

## Start of the next session

1. Read `README.md`, `ROADMAP.md`, this file, and `verification-log.md`.
2. Run `git status --short --branch` and `git log -5 --oneline --decorate`.
3. Confirm the latest GitHub Actions run for `main` passed before discussing a v1.2.0 tag.
4. Do not create or push `v1.2.0`, and do not publish a Release, unless the user explicitly requests it.

## Current project state

- Latest published release: v1.1.0.
- Repository/package version: 1.2.0, currently unreleased.
- Phase 0 and Phase 1 are complete.
- Phase 2 is complete for the requested scope; signing and notarization were explicitly excluded.
- The pre-Phase 3 correctness, lifecycle, smoke-test, and music-scanning hardening pass is complete locally but has not yet been committed or pushed.
- Phase 3 has not started.
- A normal `main` push runs CI only. `.github/workflows/release.yml` runs only when a `v*` tag is pushed.

## Phase 2 delivered

- Weather defaults to Off and makes no location/weather requests in that mode.
- Weather can use automatic IP location or a user-entered city; the UI explains which providers receive which data.
- CSP restricts renderer resources and network connections to local resources plus the declared weather endpoints.
- Fonts are bundled locally under `assets/fonts/`; Google Fonts is no longer requested at runtime.
- Electron uses renderer sandboxing and context isolation, disables production DevTools, and blocks unexpected navigation, windows, webviews, insecure content, and drag navigation.
- Default macOS output is Universal (`x86_64` + `arm64`), with optional architecture-specific scripts.
- Tag-driven Release automation validates tag/package versions, runs checks, builds Universal DMG/ZIP files, generates SHA-256 checksums, and creates or updates a GitHub Release.
- `electron-builder` was upgraded to 26.15.3. Full and production-only `npm audit` both report zero known vulnerabilities.

## Pre-Phase 3 hardening delivered locally

- Unified focus-history retention at 366 daily rows so recording a new session cannot silently truncate imported history to 60 rows.
- Made the custom Quit App action terminate Electron on macOS; tray mode continues to hide the window, and the final quit path is covered by the UI smoke test.
- Made track artwork an explicit `Track Cover` background mode so black, white, wallpaper, image, and video choices are respected.
- Replaced synchronous, unbounded music-folder scanning with asynchronous directory access, bounded metadata concurrency, sidecar-first artwork lookup, and file-backed embedded-artwork caching.
- Restricted restore scans to canonical folders previously approved through the native folder chooser.
- Forced every launched UI smoke test to use a temporary profile and wait for full document load; CI now runs both development and packaged-app smoke tests.
- Added regression coverage for 366-row history, lifecycle decisions, background precedence, bounded/cached music scanning, damaged metadata, and real backup restore.

## Last completed verification

- `npm run check`: passed.
- Unit tests: 30 passed, 0 failed.
- Development UI smoke test: passed with no renderer exceptions.
- Universal packaged-app UI smoke test: passed with no renderer exceptions.
- Offline-font checks: both bundled font families loaded; zero remote stylesheets.
- Universal executable: `x86_64 arm64` confirmed with `lipo`.
- Release workflow YAML and its local architecture/version/checksum commands were validated.
- Local artifacts were built successfully:
  - `dist/Infinite-Lo-Fi-1.2.0-universal.dmg`
  - `dist/Infinite-Lo-Fi-1.2.0-universal.zip`
- `dist/` is ignored and is not committed.
- The latest hardening changes passed `npm run check`, the isolated development UI smoke test, Universal packaging, and the isolated packaged-app UI smoke test locally. They are still uncommitted and have not triggered a new GitHub Actions run.

## Repository cleanup

- The user explicitly authorized removal of unreachable Git history.
- 3 commits, 9,782 blobs, and 1,446 trees were confirmed unreachable and pruned.
- The packed Git object store decreased from 420.79 MiB to about 500 KiB, with no unreachable objects remaining at the last check.

## Recommended next decision

After confirming the staged `main` CI run, either:

1. Observe and review the Phase 2 state without publishing, or
2. When explicitly requested, push tag `v1.2.0` and let the Release workflow publish the unsigned Universal build.

Do not start Phase 3 until the user gives a concrete instruction.
