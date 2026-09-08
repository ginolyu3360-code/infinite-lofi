# Infinite Lo-Fi Roadmap

## Current baseline

Version 1.2.0 is the current release, delivering opt-in weather, offline fonts, Electron hardening, Universal macOS packaging, automated releases, pre-Phase 3 correctness hardening, and the refreshed UI foundation.

Version 1.2.0 has been published with its Universal DMG, Universal ZIP, and checksums after successful `main` CI and Release workflow runs. Every future release must still be based on a passing `main` CI result.

## Phase 0 — Stabilize the core

Status: completed on 2026-09-07. The implementation was verified locally, pushed to `main`, and the latest GitHub Actions run passed.

- [x] Commit the recovered `src/` directory so a fresh clone can run and build.
- [x] Replace interval-based countdown logic with a deadline-based timer that remains accurate after sleep, throttling, or temporary renderer pauses.
- [x] Generate statistics day keys from the user's local calendar date instead of UTC, preventing sessions around midnight from being recorded under the previous day in positive-offset time zones.
- [x] Preserve an intentional zero-volume setting instead of restoring it to the default volume.
- [x] Add automated tests for deadline calculations, local date keys, settings normalization, notes serialization, and statistics aggregation.
- [x] Add a repeatable UI smoke test for timer, notes, player, statistics, and background controls.
- [x] Add a CI workflow that installs dependencies, runs checks/tests, builds CSS, and performs a packaging smoke check.
- [x] Align the `package.json` license with the MIT `LICENSE` file and fill in basic package metadata.

### Phase 0 completion criteria

- A fresh clone can run with `npm ci && npm start`.
- Core tests pass locally and in CI.
- Timer accuracy survives a simulated pause or system sleep.
- Focus sessions are assigned to the correct local day.
- The packaged application passes the same UI smoke test as the development build.

## Phase 1 — Protect user data and simplify maintenance

Status: completed on 2026-09-07. Data protection, stylesheet extraction, and feature/controller modularization were verified locally and in a packaged app.

- [x] Split the 2,300-line renderer into modules for timer, notes, player, statistics, backgrounds, weather, storage, and UI bindings. The renderer is now an orchestration layer, with feature models and the largest DOM controllers extracted.
- [x] Move the large inline stylesheet out of `index.html` and into the Tailwind input stylesheet or focused component styles.
- [x] Introduce a versioned storage schema and migration layer.
- [x] Add backup import and restore, not only export.
- [x] Persist useful app state such as the selected local music folder, playlist order, and active timer state where appropriate.
- [x] Add clear empty, error, and recovery states for unreadable media folders or corrupted stored data.

### Phase 1 completion criteria

- [x] Feature modules can be tested without launching the full Electron app.
- [x] Existing local data migrates without loss.
- [x] Exported backups can be imported and validated.
- [x] Relaunching the app restores documented settings consistently.

## Phase 2 — Privacy, security, and distribution

Status: completed for the requested scope on 2026-09-07. Signing and notarization were explicitly deferred; all other items were implemented and verified locally.

- [x] Make weather optional or let the user choose a city; explain that automatic weather currently uses an IP geolocation service.
- [x] Add a restrictive Content Security Policy and bundle fonts locally so the main UI does not depend on Google Fonts at runtime.
- [x] Explicitly harden Electron web preferences, disable production DevTools, and reject unexpected navigation or new-window requests.
- [x] Produce a Universal macOS build containing native Apple Silicon and Intel binaries instead of only `x64`.
- [ ] Add signing and notarization. Deferred by project decision; releases remain unsigned.
- [x] Run dependency security audits with explicit approval. Production and full dependency audits report zero known vulnerabilities after the build-tool upgrade.
- [x] Add a tag-driven workflow that verifies, builds, checksums, and creates or updates GitHub Releases.

### Phase 2 completion criteria

- [x] Core use works offline.
- [x] Network behavior is documented and controllable.
- [x] Release builds target both `x86_64` and `arm64` in one Universal application.
- [ ] Public releases are signed and notarized. Explicitly outside the current scope.

## Phase 3 — Product improvements

Only start after Phases 0–2 are stable.

### Pre-Phase 3 hardening

Status: completed, merged, released in v1.2.0, and verified by the successful `main` and Release workflows.

- [x] Keep focus-history retention consistent at 366 daily rows across storage and session recording.
- [x] Use native OS window controls and standard macOS close/quit behavior while preserving tray reopen and Quit actions.
- [x] Respect explicit background choices and make current-track artwork an opt-in background mode.
- [x] Isolate UI smoke tests from the normal application profile and run development plus packaged smoke tests in CI.
- [x] Move music scanning off synchronous filesystem calls, bound metadata concurrency, cache embedded artwork as files, and avoid base64 artwork IPC payloads.
- [x] Limit restored music-folder scans to paths approved through the native chooser.
- [x] Cover the new paths with unit and end-to-end smoke tests.

### UI foundation before Phase 3

Status: completed and verified locally on 2026-09-07. See `UI-REFRESH-PLAN.md` for the approved implementation specification.

- [x] Replace the current visual and responsive layout foundation.
- [x] Add an explicit, dedicated Mini Mode with full-window bounds restoration.
- [x] Remove timer-area scrolling and make clock/timer sizing responsive to width and height.
- [x] Rebuild statistics for readable responsive sizing and horizontal month navigation.
- [x] Enlarge interactive targets and add safe trackpad/touch-friendly behavior.
- [x] Verify representative full-window sizes and Mini Mode in development and packaged builds.

- Add configurable long breaks, auto-start options, and daily focus goals.
- Add session history editing and richer trends without turning the app into a complex analytics product.
- Improve playlist persistence, missing-file handling, and native media controls.
- Improve accessibility: focus management, reduced-motion support, contrast checks, and screen-reader announcements.
- Add curated themes and background presets after the underlying settings model is stable.

## Deliberate non-goals for now

- No framework rewrite solely for fashion or perceived modernity.
- No accounts, cloud sync, subscriptions, or backend until there is a real multi-device requirement.
- No large feature expansion before correctness tests exist.

## Repository maintenance note

The recovered source is committed, pushed, tagged, and backed by a GitHub Release. After separate authorization, 11,231 unreachable objects were pruned; the local Git object pack decreased from 420.79 MiB to about 500 KiB with no unreachable objects remaining.
