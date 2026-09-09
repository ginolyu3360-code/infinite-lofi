# Infinite Lo-Fi Roadmap

## Current baseline

Version 1.3.0 is the current release, delivering the complete Phase 3 product pass on top of the v1.2.0 security, distribution, and refreshed UI foundation.

Version 1.3.0 includes configurable focus cycles and goals, editable session history and trends, resilient playlist persistence with native media controls, expanded accessibility, and curated scenes. It has been published with an unsigned Universal DMG, Universal ZIP, and SHA-256 checksums after successful `main` CI and Release workflow runs. Every future release must still be based on a passing `main` CI result.

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

### Phase 3A — Focus Plan

Status: completed and locally verified on 2026-09-08.

- [x] Add configurable short and long breaks with a configurable number of focus sessions per cycle.
- [x] Add independent auto-start options for breaks and focus sessions while preserving the existing default behavior.
- [x] Add an optional daily focus goal with compact timer and statistics progress.
- [x] Upgrade local state to schema v2 and migrate v1 state, legacy timer settings, active breaks, and old backups without data loss.
- [x] Persist the current cycle position and restore active focus, short-break, and long-break timers safely.
- [x] Attribute an expired restored focus session to its actual local completion day without replaying missed cycles.
- [x] Cover the state machine, migration, responsive Focus Plan UI, development app, and Universal packaged app with automated tests.

### Phase 3B — Session History and Trends

Status: completed and locally verified on 2026-09-08.

- [x] Store completed focus periods as individual ledger entries while keeping daily chart totals derived and consistent.
- [x] Migrate schema v1/v2 daily totals and old backups to schema v3 as one editable imported entry per day.
- [x] Add recent-session creation, date/duration editing, and confirmed deletion without introducing projects, tags, or complex filtering.
- [x] Add active-day count, current streak, and previous-period comparison for Today, Week, and Month ranges.
- [x] Retain at most 366 distinct history days and 5,000 individual sessions to bound local storage growth.
- [x] Cover migration, editing, trends, responsive UI, development app, and Universal packaged app with automated checks.

### Phase 3C — Playlist Persistence and Native Media Controls

Status: completed and locally verified on 2026-09-08.

- [x] Replace absolute-path queue identity with stable local-folder-relative track keys and schema v4 queue snapshots.
- [x] Migrate schema v1–v3 state and backups without losing built-in or local playlist order and current-track selection.
- [x] Keep missing tracks visible, skip them during playback, and provide reconnect, rescan, clear-missing, and bundled-playlist recovery actions.
- [x] Reconnect a moved music folder by matching saved relative track keys while retaining queue order.
- [x] Publish track metadata and artwork to native Media Session surfaces with play, pause, stop, previous, next, seek-back, seek-forward, and seek-to handlers.
- [x] Preserve paused startup behavior so relaunching the app never starts audio automatically.
- [x] Cover migration, missing-folder recovery, media actions, responsive UI, development app, and Universal packaged app with automated checks.

### Phase 3D — Accessibility

Status: completed, merged, and verified by passing `main` CI on 2026-09-08.

- [x] Give Focus Plan, Stats, Scene, shortcut help, responsive Notes, and Queue predictable focus entry and focus restoration.
- [x] Keep modal focus inside open dialogs, close responsive panels with Escape, and hide closed surfaces from the accessibility tree.
- [x] Announce timer, phase, playback, track, Focus Plan, and session-history changes without announcing every countdown tick.
- [x] Expose dialog names, disclosure states, statistics ranges, chart entries, and current playlist selection with appropriate semantics.
- [x] Raise core dark and White Scene text contrast to WCAG AA, including White Scene primary controls.
- [x] Verify reduced-motion behavior, contrast ratios, focus behavior, and the Chromium accessibility tree in development and packaged Electron checks.

### Phase 3E — Curated Scenes

Status: completed, merged, and verified by passing `main` CI on 2026-09-09.

- [x] Add four built-in scene presets: Quiet Studio, Midnight, Moss, and Paper.
- [x] Give presets distinct interface palettes, atmospheric backgrounds, live previews, and accessible selected states.
- [x] Keep wallpaper, image, video, and track-cover sources independent from the curated presets.
- [x] Add `presetId` within the existing `settings.ui.background` object without changing schema v4.
- [x] Map legacy black, white, and custom-media settings to safe presets while preserving saved media paths.
- [x] Verify every preset, persistence, WCAG AA core text contrast, responsive layouts, development Electron, and Universal packaged Electron.

## Phase 4 — Focus Depth

Status: proposed on 2026-09-09; no Phase 4 business code has started. The slices below are an initial product plan and should be approved one at a time before implementation.

Phase 4 should deepen the path from choosing an intention, through a focused session, to reviewing useful patterns. It should remain local-first and should not turn Infinite Lo-Fi into a general project manager, streaming service, or productivity-scoring system.

### Phase 4A — Focus Intent (recommended first)

Goal: let the user decide what the next focus session is for without duplicating the existing free-form Notes workspace.

- Add a lightweight ordered task queue with one optional active intention, simple completion, reopening, renaming, and deletion.
- Let each focus session reference the active task while also storing a title snapshot, so deleting or renaming a task never makes historical sessions meaningless.
- Show the active intention beside the main timer and in Mini Mode; manage the short queue in a focused drawer rather than adding permanent dashboard density.
- Keep the first slice deliberately small: no projects, subtasks, due dates, reminders, recurring tasks, priorities, tags, search, or cloud sync.

Data and migration boundary:

- Proposed schema v5 adds a bounded `tasks` collection and an optional `activeTaskId`. A task needs only a stable ID, title, status, sort order, creation time, and optional completion time.
- Focus-session ledger entries gain optional `taskId` and `taskTitle` snapshot fields. Existing schema v4 sessions migrate with both fields empty, preserving every duration and date exactly.
- Backup import/export must accept v1–v4 data and round-trip v5 tasks and linked sessions. Invalid task references must fall back to the stored title snapshot or an unassigned session.

Test boundary:

- Cover v4-to-v5 migration, bounded retention, ordering, completion/reopening, deletion with preserved history, backup compatibility, timer attribution, local-day behavior, keyboard/focus management, Mini Mode, responsive UI, and packaged Electron.

### Phase 4B — Soundscapes

Goal: enrich focus atmosphere without changing the existing local-playlist model or starting audio unexpectedly.

- Add optional ambient layers such as rain, café, and soft noise with separate music, ambience, and master levels.
- Add short fades for play, pause, track changes, and timer phase changes; consider a simple sleep timer only after the mixer is stable.
- Keep ambience off by default, restore it paused after relaunch, and make native media controls continue to describe the music track rather than an internal ambience layer.
- Use only bundled assets with explicit redistribution rights or user-selected local files. Do not add remote streaming, accounts, catalogue browsing, or background downloads.

Data and migration boundary:

- Prefer additive settings inside the existing player state: enabled layers, per-layer volume, master ambience volume, and fade preference. Increase the schema version only if persistent user-imported sound identities require migration guarantees.
- Missing custom files must degrade to a visible unavailable state without blocking the bundled playlist or timer.

Test boundary:

- Cover volume normalization, mute/zero persistence, mixing and fade state, relaunch-without-autoplay, missing-file recovery, offline behavior, Media Session separation, reduced motion, keyboard access, packaged audio playback, and an explicit package-size/performance budget.

### Phase 4C — Focus Insights

Goal: turn the existing session ledger into useful reflection, not pressure or opaque scoring.

- Add weekly and time-of-day patterns, goal consistency, and task-linked breakdowns once Phase 4A has supplied reliable task context.
- Extend the existing statistics drawer rather than creating a second analytics surface; preserve CSV export and clear empty/explanatory states.
- Derive insights from the canonical session ledger at render time or through testable selectors. Do not persist duplicate totals that can drift from edited history.
- Avoid leaderboards, shame-oriented streak messaging, predictive claims, and a single productivity score.

Data and migration boundary:

- The first insights slice should require no new historical schema beyond optional Phase 4A task snapshots. Persist only presentation preferences if they materially improve usability.
- Date bucketing must continue to use local calendar days and explicitly handle daylight-saving changes, imported legacy totals, edited sessions, and deleted tasks.

Test boundary:

- Cover empty/sparse/dense histories, previous-period comparisons, local-day and DST edges, task renames/deletions, imported sessions, accessible chart summaries, responsive month navigation, export consistency, and packaged Electron.

### Recommended Phase 4 sequence

1. Phase 4A Focus Intent, because it creates the semantic link that later statistics can use while remaining a small, testable product slice.
2. Phase 4B Soundscapes, because it is independent of analytics but needs careful asset, package-size, audio-state, and no-autoplay validation.
3. Phase 4C Focus Insights, because it can then summarize both the established session ledger and the optional task context without another data-model rewrite.

Each slice should use its own `codex/` feature branch, pull request, passing CI run, and squash merge. A Phase 4 release version, tag, and Release remain separate decisions.

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

## Deliberate non-goals for now

- No framework rewrite solely for fashion or perceived modernity.
- No accounts, cloud sync, subscriptions, or backend until there is a real multi-device requirement.
- No large feature expansion before correctness tests exist.

## Repository maintenance note

The recovered source is committed, pushed, tagged, and backed by a GitHub Release. After separate authorization, 11,231 unreachable objects were pruned; the local Git object pack decreased from 420.79 MiB to about 500 KiB with no unreachable objects remaining.
