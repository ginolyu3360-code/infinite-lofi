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

Status: re-audited and documented on 2026-09-10. Phase 4A was completed, squash-merged, and verified by passing exact-merge `main` CI on 2026-09-11; Phase 4B, 4C1, and 4C2 remain unstarted. This section supersedes the 2026-09-09 draft.

### Product decision and sequence

Keep the product local-first and low-distraction. The intended loop is choosing an optional intention, completing a focus session, and reviewing recorded time. Tasks must earn their place by making the next session clearer, not merely by supplying future analytics.

| Order | Slice | Deliverable | Dependency |
| --- | --- | --- | --- |
| 1 | 4A — Focus Intent | A short task list, optional session intention, immutable session attribution, safe persistence and backup | Existing timer, Notes, history, and accessibility foundation |
| 2 | 4B — Focus Review | Task-time breakdown and clearly defined recent-period reflection | 4A for task breakdown; existing ledger for other summaries |
| 3 | 4C1 — Ambient Layer | One explicitly started bundled ambient sound alongside music | Independent of task analytics |
| 4 | 4C2 — Audio Transitions | Bounded, cancellable audio fades and explicit phase-transition behavior | Stable C1 playback state and media controls |

Recommended execution order: **4A → 4B → 4C1 → 4C2**. C1 can move ahead of B after an explicit product-priority decision; there is no technical dependency from analytics to ambience. Implement and verify one slice at a time. In this revised plan, B means Focus Review; the former Soundscapes draft is split into C1/C2, and the former broad Focus Insights promise is narrowed to B.

### Audit findings that constrain implementation

- Notes already supports named tabs, free-form text, pinning, and ordering. Giving tasks descriptions, note bodies, pinning, or a second permanent workspace would duplicate existing behavior.
- Reading the selected task at timer completion would misattribute a session if the selection changed while it ran. Selection for the next session and attribution of the current session are separate state.
- `core.normalizeFocusSessions`, `stats.recordFocusSession`, and `stats.upsertFocusSession` currently construct explicit field lists. Adding task fields at only one call site loses those fields on later normalization or editing.
- The renderer currently records a completed session and saves the next timer runtime separately. A must make this one repository update and use a stable session ID for idempotence.
- Backup import currently validates the wrapper version without enforcing agreement with the inner state version. A must validate both before replacement.
- `completedAt` is a completion timestamp, not a record of active intervals. Editing a session date currently leaves that timestamp unchanged. Legacy daily totals and manual entries may have no timestamp at all.
- Daily goal settings have no historical change log. Comparing every past day with today's goal is a current-target comparison, not historical goal compliance.
- History retention means the latest 366 distinct recorded dates and at most 5,000 entries, not a guaranteed complete rolling year. Imported daily totals are not individual sessions.
- Notes becomes an overlay at 900 px in the implementation, and the native Mini minimum is 360 × 200. The older UI refresh document's breakpoint guidance must not override those actual boundaries.
- `renderTimer` currently clones the full repository state to read daily totals. Adding more state must not extend this per-second work; use a refreshed lightweight summary or selector in A.
- The current keyboard handler processes `?` before its typing guard. New task editing must handle typing, composition, consumed events, and dialog-local Escape before global shortcuts.

### Phase 4A — Focus Intent

Goal: make it easy to say what the next focus session is for, without requiring a task or creating another note editor.

Implementation status: completed through [PR #16](https://github.com/ginolyu3360-code/infinite-lofi/pull/16) on 2026-09-11. Final feature commit `4086636` passed CI run `34593226577`, was squash-merged as `cd8bdb9`, and the exact merge commit passed `main` CI run `34593481248`.

#### Product scope

- Add, rename, select/unselect, complete, reopen, and confirm deletion of a task.
- Each task contains a short plain-text title only. Empty/whitespace-only titles are rejected; duplicate titles are allowed because identity is the task ID.
- Show open tasks in stored creation order. New and reopened tasks keep their original stored position; completing a task does not reorder the underlying array. Completed tasks appear in a separate collapsed section, newest completion first, with stable ID as a tie-breaker.
- No drag-and-drop, manual reordering, priority, pinning, automatic next-task selection, or automatic task completion in A.
- A task is optional. Starting without one records an unassigned session with no blocking prompt.
- Show the current intention near the main timer. Manage tasks in a drawer using the existing visual and accessibility conventions.
- Show the saved task-title snapshot in recent session history. Keep existing date/duration editing and deletion; manual additions remain unassigned. Editing historical task attribution is deferred.
- Notes remains the free-form workspace. Do not infer tasks from notes, migrate note titles into tasks, or add automatic links between the two.

#### Timer and task behavior contract

| Event | Required result |
| --- | --- |
| First manual or automatic start of a focus session | Generate a stable session ID and freeze the selected open task ID/title, or an explicit unassigned snapshot. Persist it with the running runtime. |
| Pause, resume, window recreation, or app relaunch | Preserve the current session ID and snapshot. Pausing does not create a new session. |
| Select/unselect another task during an existing session, including pause | Change only the next-session selection. Clearly distinguish current-session attribution from next-session selection in the drawer. |
| Rename a task | Update its list title and future snapshots; do not change current or historical snapshots. |
| Complete a task | Clear the next-session selection if it points to this task. Keep the current timer and snapshot. Do not stop or complete the timer. |
| Reopen a task | Make it selectable again; do not select it automatically or modify history. |
| Finish a focus session | Record the frozen snapshot under the stable session ID. Do not complete the task or choose another task. Persist the ledger change and next runtime together. |
| Start the next focus after a break | Capture the then-current valid selection. Auto-start and explicit Start use the same attribution path. |
| Reset or apply a new Focus Plan | Discard unfinished session context and start a fresh cycle, preserving the next-session selection. Do not record partial time. Synchronize an already-expired deadline first so a genuinely completed session is not lost. |
| Restore an expired focus timer | Record at its actual deadline/local completion day once, using its saved snapshot; advance only one phase and leave the next phase paused, preserving existing recovery behavior. |
| Delete a task | Remove it from the list and clear its next-session selection; keep current/historical snapshots. Confirmation must state that recorded names remain in history. |
| Delete a session or clear statistics | Modify the ledger and derived totals only; keep tasks, their status, and current timer context. A later completion may create a new record after Clear. |

Task deletion is not historical erasure. History retains its task ID as historical identity even if that task no longer exists. Do not add an unbounded tombstone collection. Removing already-recorded names requires deleting the relevant history or clearing statistics; task deletion must not claim otherwise. An in-progress deleted task may still appear in history when its current session finishes, as explained in the confirmation.

#### Proposed schema v5

Extend the existing state; do not replace unrelated settings, notes, player identities, or ledger fields. Canonical empty task references are `null` and empty title snapshots are `""`.

```js
{
  schemaVersion: 5,
  tasks: {
    items: [
      {
        id: "task-uuid",
        title: "Read chapter 3",
        status: "open", // "open" | "completed"
        createdAt: 1789000000000,
        completedAt: null
      }
    ],
    selectedTaskId: null
  },
  timerRuntime: {
    // Existing phase, cycle, remainingSeconds, deadlineMs, isRunning fields.
    focusSession: {
      id: "focus-uuid",
      taskId: "task-uuid",
      taskTitle: "Read chapter 3"
    }
    // null before a focus session starts and during a break.
  },
  stats: {
    focusSessions: [
      {
        id: "focus-uuid",
        day: "2026-09-10",
        focusSeconds: 1500,
        completedAt: "2026-09-10T02:25:00.000Z",
        source: "timer",
        taskId: "task-uuid",
        taskTitle: "Read chapter 3"
      }
    ],
    focusRows: [] // Recomputed compatibility data; not an independent ledger.
  }
}
```

- `selectedTaskId` describes a future choice, not the identity of an already-running session. It must point to an existing open task or be `null`.
- Runtime `focusSession: null` means no session has started. An unassigned started session still has a non-null object with a session ID, `taskId: null`, and `taskTitle: ""`; do not infer started state from task presence or remaining duration.
- IDs are stable nonempty strings, at most 128 characters; generate new IDs with a collision-resistant UUID mechanism. Preserve valid existing ledger IDs.
- Task title: trimmed, single-line plain text, at most 120 Unicode code points. Apply the same bound to new snapshots and validate pasted text and emoji without cutting surrogate pairs. Render with text nodes, never HTML.
- `createdAt` and task `completedAt` use finite epoch milliseconds; ledger `completedAt` retains its existing ISO-string convention. An open task has `completedAt: null`; completing supplies a timestamp and reopening clears it.
- Array order is sufficient; do not persist a redundant `sortOrder`, task totals, counts, or a second history ledger.
- Snapshot text is immutable for normal task operations and date/duration edits. A missing live task is valid for a historical reference. A title without a usable ID remains readable as snapshot-only history and must not be matched to a task by title. An ID without usable snapshot text must not be used to invent a past title.
- Validate duplicate task IDs rather than assigning ambiguous references to arbitrary tasks. Invalid selection becomes unassigned; malformed v5 task records or oversized collections in a backup must produce an actionable error before replacement. Preserve raw corrupted stored data through the recovery path.

#### Migration, backups, and write safety

- Upgrade v4 to v5 with an empty task collection, null selection, and unassigned legacy session attribution. Preserve valid existing session ID, day, seconds, source, and completion timestamp exactly; recompute daily totals from the ledger.
- Continue the existing legacy/v1/v2 daily-total and v1–v3 player migrations. Accept legacy and v1–v4 backups; round-trip v5 tasks, ordering, selection, runtime context, and history.
- Existing v4 running or partially elapsed paused focus timers migrate to an unassigned session context with a stable ID before they can be completed. A never-started timer remains ready for a new snapshot. When old data cannot distinguish these states, use the conservative unassigned attribution; never attach a newly selected task retroactively.
- Validate wrapper and inner schema versions before import. Reject mismatches and future versions; do not silently treat a future state as v5. Compatibility does not promise that old applications can read v5 backups.
- Validate restore completely before asking to replace local data. Include task counts in the restore summary. Restore replaces the complete state, not merges it; cancel pending notes/task saves and prevent pre-restore or unload handlers from overwriting the restored state.
- Repeated completion callbacks must not append duplicate sessions. The same runtime session ID is the ledger identity, and recording plus clearing/advancing runtime happens in one repository update. Do not rely on the current duplicate-ID renaming normalizer for completion idempotence.
- Serialize and write the next state successfully before publishing it as the new in-memory repository state or announcing success. On quota/write failure keep the last committed state, surface the failure, and do not falsely mark a task or session as saved. Completion failures must not produce duplicate records on retry.
- No task totals stored independently of history. Pruning or editing the ledger must not update task completion status.

#### UI and accessibility contract

- Full view adds one intention summary and management entry near the timer, not a permanent third column. When a session exists, show its frozen title; before a session starts, show the selected future intention. Use a clear unassigned state.
- The Tasks drawer distinguishes the current snapshot and next selection when they differ. Opening it closes conflicting drawers, responsive Notes/Queue, and shortcut help; entering Mini closes it. Backdrop and appropriate touch-swipe behavior must follow existing conventions without swallowing list scrolling.
- Mini shows intention text only, with no task editor or completion controls. Reuse the compact summary area; prioritize intention over secondary cycle/goal copy when space is insufficient. Preserve phase, time, Start/Pause, Reset, track, playback, and return-to-full controls.
- Long titles may visually ellipsize, but their full text must be available to assistive technology and in the full drawer. Do not rely on mouse hover as the only way to read the title.
- Use named dialogs, disclosure state, closed-surface inert/hidden state, focus entry, Tab/Shift+Tab containment, and focus return. After row removal, completion, or rerender, move focus to a predictable surviving control.
- Enter saves an edit and Escape cancels it before closing the containing drawer. Composition/IME events and consumed/default-prevented events must not invoke global actions; typing `?` must work. New forms must not trigger note clearing, timer reset, or media shortcuts accidentally. Do not add a new global shortcut merely for completeness.
- Announce selection/status changes once through the existing live region; never announce every countdown tick. Prefer native buttons and forms over custom listbox/drag interactions.
- Check new controls and text across Quiet Studio, Midnight, Moss, and Paper, including visible keyboard focus, AA ordinary-text contrast, reduced visual motion, and approximately 44 px primary targets in full view.

#### Limits and performance acceptance

- At most **100 retained tasks total**, including completed tasks. No time-based task expiration or automatic eviction. At capacity reject creation with clear guidance; reopen and complete remain possible. Reject an oversized backup before replacement rather than silently slicing its task list.
- Render at most **20 task rows per page**; expose ordinary keyboard-accessible pagination/counts for both open and completed sections. Keep the current/selected summary visible even if its task is on another page.
- Retain the existing **366 distinct recorded days / 5,000 sessions** cap. Do not reinterpret it as 366 elapsed days or weaken legacy preservation within those limits.
- No task persistence, full task rerender, or new history scans on each timer tick. Replace the existing full-state clone used by the timer summary with a lightweight cached summary refreshed on relevant changes and local-day rollover.
- On the user's M2 reference machine, target p95 **under 100 ms** from task action to visible update and from drawer open to ready controls, using 100 tasks and 5,000 maximum-title sessions. Record fixture, measurement method, repetitions, and observed values; this is a target to verify, not a measured claim. Avoid fragile universal wall-clock thresholds on hosted CI.
- Notes currently has no equivalent size cap. Do not impose a destructive new Notes limit or claim task limits guarantee storage cannot fill; handle storage quota errors explicitly.
- Use focused pure task/model helpers and a controller consistent with the existing code. No framework migration, new database, or general state-management rewrite.

#### Phase 4A release-independent acceptance checklist

- [x] Task operations, capacity handling, ordering, pagination, and Notes separation match the above contract.
- [x] Running/paused/automatic/restarted/unassigned attribution stays correct through selection changes, rename, complete, delete, reset, and applying a new plan.
- [x] Completion and restored-expiry paths are idempotent and atomic at the repository boundary; include local-midnight and daylight-saving cases and injected write failure/retry.
- [x] Legacy and schema v1–v4 migration fixtures preserve valid preexisting data; v5 backup round-trip includes active context and tasks. Reject mismatched/future versions and malformed/oversized task data without replacing current data.
- [x] Normalization, history editing, deletion, pruning, and daily CSV retain the intended attribution/totals. Daily CSV format stays unchanged; full backup contains task data.
- [x] Model/controller tests cover invalid and duplicate IDs, missing live tasks, snapshot-only history, empty/long/Unicode titles, 100/101-task limits, selection of completed tasks, and storage failure.
- [x] Real Electron tests cover task editing, IME/shortcut boundaries, focus entry/return, Tab trapping, Escape hierarchy, row removal, accessibility-tree names, scene contrast, and reduced visual motion.
- [ ] Full layout fits 720 × 520, 800 × 600, 1100 × 760, and 1440 × 900, plus both sides of the 900 px Notes breakpoint. Where a display cannot provide a target size, report that limitation instead of claiming it passed.
- [x] Mini fits 420 × 250 and 360 × 200, including maximum timer text and long titles, with no clipped primary controls or timer scrollbar; prior full bounds restore.
- [x] `npm run check`, isolated development smoke, Universal packaging, and isolated packaged-app smoke pass with no renderer exceptions. Update syntax-check and packaging inclusion lists for new modules.
- [x] Record reference-machine performance measurements and regression coverage for notes, music, backgrounds, history, restore, native window lifecycle, and tray behavior.
- [x] PR CI passes for the final feature commit; squash merge is followed by passing main CI and updated handoff/verification evidence. No version bump, tag, or Release is implicit.

Local verification note: native full-window checks passed at 720 × 520, 800 × 600, 899 × 700, 901 × 700, 1100 × 760, and the display's largest available 1440 × 797 viewport. This machine could not provide a native 1440 × 900 viewport, so that exact height remains explicitly unverified. With 100 maximum-title tasks and 5,000 maximum-title sessions over 30 repetitions, the final pre-PR local rerun measured development p95 at 17.4 ms for drawer open and 38.0 ms for a visible selection update; packaged smoke measured 17.1 ms and 37.9 ms respectively.

### Phase 4B — Focus Review

Goal: explain recorded time with modest, transparent summaries. This is a narrower replacement for the original Focus Insights proposal, not an intelligence or productivity-scoring feature.

#### Scope and interpretation

- Extend the existing Stats drawer with task-time breakdown for Today, Last 7 Days, and Last 30 Days. Clearly label rolling periods; existing Week/Month implementations are not calendar-week/month navigation.
- Show total recorded time, active recorded days, and previous equal-period comparison using the canonical ledger. Retain existing useful summaries instead of duplicating them in a second analytics surface.
- Group attributable sessions by stable task ID, including deleted tasks. Distinguish same-title/different-ID tasks. For an existing task use its current title as the group label; for a deleted task use the latest retained snapshot and a deleted indication. Individual history rows always keep their own snapshots.
- Show snapshot-only entries separately from identifiable tasks, and include unassigned time. Do not match groups by title or hide unassigned/imported time to make coverage appear better.
- Sum integer seconds first, then round for display. Task groups plus snapshot-only/unassigned time must equal the selected ledger total before rounding. Explain any displayed rounding difference.
- Show the covered date range and retained-record limits. Absence of a retained record means no recorded time, not proof of inactivity. At retention boundaries, do not claim comparisons represent a complete historical period.
- Imported daily totals contribute duration but never count as real individual sessions. Do not introduce average-session-length or session-count claims that treat migrated totals as sessions.
- Preserve daily CSV export. If a task breakdown CSV is added, give it a separate action and stable columns; correctly quote commas/newlines/quotes and neutralize spreadsheet-formula-leading user text without altering stored titles. Full JSON backup remains the loss-preserving export.

#### Deliberately deferred insights

- No actual time-of-day focus distribution from `completedAt`; no guessed start time by subtracting duration, because pauses invalidate that inference.
- No historical goal-compliance claim from the current goal. If retaining a current-target comparison, explicitly say it applies today's target to recorded history. Historical goals require a separately designed goal-change/day-coverage model, including days with no sessions.
- No predicted best focus time, effectiveness inference, leaderboards, productivity score, or pressure-oriented messaging.
- No collection of new time/goal metadata in A solely to speculate about these later features.

#### Data, UI, and acceptance

- No new ledger schema is expected beyond A. Persist only necessary presentation preferences; do not persist task aggregates or duplicate totals.
- Bucketing uses stored `day` as the historical date. Do not rebucket edited sessions from their unchanged `completedAt` or silently shift recorded days when the current timezone changes.
- Use pure selectors and bounded rendering. Paginate or collapse long breakdowns rather than rendering 5,000 rows; no chart recomputation on timer ticks. Target p95 under 100 ms for a range change at the existing history cap on the reference machine and document measurements.
- Test empty, sparse, dense, all-unassigned, imported, renamed, deleted, snapshot-only, and same-title/different-ID histories; include date edits, duration edits, deletion, retention, local-calendar/DST boundaries, and zero previous-period totals.
- Test aggregate reconciliation and CSV escaping if the extra export is shipped. Explain a zero denominator instead of displaying Infinity or misleading percentages.
- Give charts readable text summaries and accessible labels, support keyboard/trackpad navigation, preserve responsive Stats behavior, and pass all existing size/theme checks in development and Universal packaged Electron.
- This slice needs its own feature PR, final-commit CI, squash merge, main CI, and handoff entry. Review its exact presentation before implementation; do not expand into the deferred insights.

### Phase 4C1 — Ambient Layer

Goal: add a small, reliable offline ambient sound choice without changing the local music library into a streaming catalogue or immediately building a multi-channel mixer.

#### Scope and playback contract

- Provide a small curated set of bundled sounds, such as rain, cafe ambience, or soft noise; permit **one ambient layer at a time** alongside the existing music player.
- Asset choice is a content gate: verify explicit redistribution permission and retain source, author, license, and required attribution in the repository. If suitable assets are unavailable within budget, report that blocker; do not silently download substitutes or add remote runtime requests.
- Ambient playback defaults off. Persist selected asset ID and volume, including exact zero; do not persist a command that starts playback on launch or restore. Relaunch, restore, and unexpected recovery always leave ambience paused.
- A dedicated ambient control starts/stops it explicitly. Music and ambient volume are separate; do not introduce a master-volume hierarchy in C1. Reuse the Scene/audio drawer conventions and keep the main player compact.
- Music Play/Pause controls music. Native Media Session pause/stop must silence both music and ambience so a system stop cannot leave unexpected sound running; native play starts music only. It must not silently re-enable ambience previously stopped by that action. Explain the difference in control labels/help.
- Native media title/artwork/seek controls continue to represent music only. Ambient selection must not replace track metadata or make seeks target the ambient buffer.
- Ambient selection changes while playing stop the previous layer before starting the new one. Selection while paused stays paused. Rapid selection, ended/load-error callbacks, and repeated toggles must never leave two ambient layers running.
- Timer starts/pauses/phase changes do not start or change ambient playback in C1; any later phase coupling belongs to C2. App quit/window recreation must not leak an audio source.
- Handle missing or undecodable bundled assets with a visible unavailable state; timer and local music remain usable. User-imported ambient files, file permissions/reconnect flows, and concurrent ambient layers are deferred.

#### Proposed persistence and budgets

- Add a bounded normalized setting such as `player.ambience: { soundId: null, volume: 0.35 }`; valid IDs come from the bundled manifest. Runtime playback state remains separate. Old backups default to no selected sound and paused playback.
- An additive setting may remain on schema v5 if it preserves A's contracts. Reassess migration explicitly if a breaking interpretation is proposed; schema versions are not tied to feature letters.
- Initial proposed budgets: bundled ambient assets at most **15 MiB total**; incremental unpacked app content at most **20 MiB**; one ambient source; no recurring renderer network requests; no unbounded decode queue.
- At implementation kickoff measure the music-only baseline. On the reference M2, target incremental steady-state CPU at most **5 percentage points of one logical core** averaged over a documented 60-second sample and incremental memory at most **50 MiB**. State which Electron processes and memory measure were used. These are initial acceptance targets, not measurements; revise explicitly before implementation if asset/decoder evidence makes them unrealistic.
- Prefer bounded/lazy audio loading. Inspect audible loop seams and compare actual packaged sound, not just an HTML media element's playing flag. No new runtime dependency without a concrete need.

#### Acceptance

- Tests cover volume clamp/zero, invalid IDs, migration/backup round-trip, independent music/ambient controls, system pause/stop, paused startup/restore, rapid sound changes, decoding failure, and cleanup.
- Offline checks show no added requests. Existing local music queue, missing-folder recovery, media metadata/seek behavior, Notes, timer, and Mini remain functional.
- Real development and Universal packaged Electron checks exercise actual decoded playback, audible loop quality, pause/resume, system commands, accessible controls, keyboard focus, themes, and supported sizes. If listening requires the user, supply a numbered tutorial and leave that check explicitly pending.
- Record licenses/attribution, package-size delta, process CPU/memory measurements, and the verified concurrency bound before considering C1 complete. Use the same PR/CI/squash/main-CI handoff workflow.

### Phase 4C2 — Audio Transitions

Goal: add predictable audio transitions after C1 is stable, keeping final playback intent authoritative even during rapid actions or suspended execution.

#### Scope and state contract

- Add short configurable on/off fades for explicit playback changes and sequential track/sound switches. Start with a fixed bounded duration (recommended **200 ms**, normalized maximum **500 ms**); no overlapping music-track crossfade is required.
- Treat persisted user volume and transient fade gain separately. Effective gain is their product; fading must never overwrite saved volume, break exact mute, or increase past the user's target.
- Each channel has one cancellable transition. A newer play/pause/selection command supersedes the previous transition; stale callbacks must not resume old tracks or resurrect stopped sound.
- Playback startup and backup restore remain paused. Reset gains safely on error, close, suspend/resume, and source replacement. Cancellation must release scheduled callbacks/resources.
- Native stop silences both channels immediately and cancels all transitions. Native pause may use a bounded fade but must settle paused within the declared maximum. Native play retains C1's music-only meaning.
- Preserve existing music/timer start and pause semantics while applying fades through a single transport path. A timer phase change must not override a later user pause or secretly turn on ambience.
- Default phase-transition behavior preserves current user levels. Optional phase ducking, if approved for this slice, affects only already-playing audio, restores the exact prior user level, and has a separate explicit setting. Do not automatically add it merely because the original draft mentioned phase changes.
- Audio-transition preference is independent of `prefers-reduced-motion`. Continue to respect reduced visual motion for UI animation; do not claim that it determines a user's audio preference.

#### Data, limits, and acceptance

- Proposed additive setting: `player.audioTransitions: { enabled: false, durationMs: 200 }`. Persist preferences only, never an in-progress envelope or autoplay intent. Verify old/v5 backup defaults and zero-volume compatibility.
- Keep at most one active transition per channel and no idle polling after it settles. Continue C1 asset/source limits; C2 adds no sound assets by default. Re-measure against the C1 performance baseline and preserve its incremental budgets relative to music-only playback.
- Pure model/fake-clock tests cover gain bounds, rapid play/pause/play, volume changes during fade, source replacement, timer phase change, system stop, cancellation, late callbacks, failures, and suspend/resume.
- Development and packaged Electron checks verify actual final paused/playing state, audible transitions, no old-source resurrection, correct Media Session state, settings accessibility, and unchanged timer/task/history behavior.
- If optional phase ducking would require a more complex state model, defer it rather than growing this slice. Sleep timers, multi-layer mixing, custom ambient-file imports, streaming, and background downloads remain separate proposals.
- Complete the normal feature PR, final-commit CI, squash merge, post-merge main CI, and documentation evidence; no release action is implicit.

### Phase 4 execution and handoff rules

1. Use only `/Users/lvjunhao/Documents/GitHub/infinite_lofi`. Work directly in this checkout; never create another worktree or use/rebuild the removed ChatGPT-folder checkout.
2. Read README, this roadmap, HANDOFF, verification-log, UI-REFRESH-PLAN, and repository AGENTS if present. Check working changes, current branch, recent commits, tags, real remote main, and latest main CI. Preserve user changes.
3. The user will direct GPT-5.6 sol to execute. Do not create another task, switch models, or start implementation merely because this plan is saved. Obtain the user's instruction for the next slice; do not treat approval of A as approval of B/C1/C2.
4. Each implemented slice uses `codex/` feature branch → Pull Request → passing CI for the final PR commit → squash merge. Never commit directly to main. Keep package version 1.3.0 until a separate version/release instruction.
5. After each merge, check main CI for that exact merge commit, then record PR, commit, CI links/results, checks, limitations, and next boundary in HANDOFF and verification-log. Merge evidence that could not exist before the feature merge goes in a follow-up documentation PR; verify its main CI too. Do not bypass the PR rule to write post-merge notes.
6. Local checks must use isolated profiles. Do not mutate the user's installed app data or restore real backups just to test. Report unperformed checks accurately and provide numbered Chinese instructions when user interface operation is necessary.
7. No signing/notarization, framework rewrite, accounts, cloud sync, backend, subscription, project hierarchy, deadlines, reminders, tags, task search, task descriptions, Notes bidirectional linkage, mid-session split attribution, or partial-time accounting in these slices.
8. Creating a version tag, publishing a GitHub Release, or changing the unsigned distribution policy requires a separate explicit instruction. A passing feature CI is not release authorization.

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
