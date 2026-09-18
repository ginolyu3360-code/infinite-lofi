# Changelog

## 1.5.0 — 2026-09-15

- Improved lyrics discovery with cached instrumental recognition, confidence-ranked LRCLIB/QQ Music/lyrics.ovh fallbacks, safer cover matching, ambiguity rejection, and a visible active state for the Queue button
- Skipped duplicate tracks during local-folder scans using normalized title, artist, duration, and copy-name fallbacks while preserving the highest-quality source file
- Added an optional synchronized lyrics panel with same-name LRC and embedded-tag priority, opt-in LRCLIB lookup, local caching, and compact responsive player controls
- Reduced repeat scans of large local libraries from up to five artwork-cache file probes per track to one cache-directory index read per scan
- Prevented stale folder scans from replacing a newer library selection and exposed a disabled/busy rescan state while scanning
- Kept Queue event listeners constant for large libraries and avoided rebuilding all track rows during ordinary track changes or swap selection
- Isolated development and packaged UI smoke runs at the Electron app-data level so tests cannot read or mutate the installed app's profile
- Added Windows 11 x64 packaging through an assisted per-user NSIS installer, with Windows application and tray icon handling
- Added Windows development/packaged smoke coverage and multi-platform GitHub Release assembly with shared SHA-256 checksums
- Added single-instance startup behavior and hid the macOS-only desktop-wallpaper action on Windows
- Made the development smoke runner launch Electron through a Windows-native executable and restore minimized single-instance windows before showing them
- Preserved the intended full and Mini content-area minimums across native window frames and made responsive smoke checks size the content viewport consistently
- Made isolated UI smoke cleanup wait for Electron exit and retry transient Windows profile locks
- Prevented window focus events from being misread as timer timestamps and immediately ending active focus or break phases
- Kept native media controls responsive while the window is minimized, restoring normal background throttling when the window returns
- Added a native macOS Now Playing and remote-command bridge so paused AirPods play and track controls remain assigned to Infinite Lo-Fi without Accessibility permission
- Reduced repeated Focus Review normalization and state cloning during range changes, keeping the 5,000-session reference fixture below its 100 ms p95 target on Windows
- Allowed the UI smoke runner a four-pixel native-resize tolerance while retaining strict content-overflow and control-visibility checks at the 360 × 200 Mini target
- Made tag-triggered release builds run development and packaged UI smoke tests on both platforms and publish the Release after all required jobs pass
- Expanded the desktop window to a display-safe 900 × 780 content target while Queue is open, prevented resize clipping, and restored the ordinary minimum after Queue closes

## 1.4.1 — 2026-09-14

- Added scrollable and full-size Queue management, retained drag reorder, and added click-to-swap plus double-click playback
- Added persisted Repeat One and non-repeating-cycle Shuffle playback modes
- Added previous/next and seeking to Mini Mode, enlarged responsive timer typography, and simplified the Queue-open timer surface
- Raised the optional audio-fade limit from 500 ms to 3000 ms and prevented redundant music restarts/fades when focus starts during playback
- Made the Show-mode timer card more transparent, enabled backdrop-click closing for large drawers, and reset Notes Delete All to one empty `Note 1`
- Corrected the neutral release-tag example in the distribution guide
- Enlarged the usable top window-drag region while keeping header buttons interactive

## 1.4.0 — 2026-09-14

- Added optional title-only Focus Intent tasks with next-session selection and immutable in-session/history snapshots
- Added stable focus-session IDs and atomic, idempotent completion persistence across live completion and expired recovery
- Upgraded local state to schema v5 with v1–v4 migration, strict backup validation, and write-failure rollback
- Added exact-second Focus Review summaries for Today, the last 7 days, and the last 30 days with stable task identity and bounded pagination
- Added immediate interface switching for Simplified Chinese, Traditional Chinese, English, Japanese, French, Korean, and Spanish
- Added three original MIT-licensed offline ambient loops with one independently controlled layer beside music
- Added optional bounded and cancellable audio fades for play, pause, and sequential music or ambient source changes
- Preserved exact mute, paused startup, music-only native play, combined native pause/stop, and existing Notes, timer, playlist, history, and scene behavior
- Added 98 automated checks plus isolated development/Universal packaged smoke coverage for migration, recovery, IME, accessibility, responsive layouts, audio races, and maximum retained data

## 1.3.0 — 2026-09-09

- Added configurable short and long breaks with a focus-cycle counter
- Added independent auto-start options for breaks and focus sessions
- Added an optional daily focus goal with progress in the timer and statistics views
- Upgraded local state to schema v2 with automatic v1 and legacy-backup migration
- Preserved the actual local completion day when an expired focus timer is restored after midnight
- Added editable per-session focus history with manual entry and confirmed deletion
- Added active-day, current-streak, and previous-period trend summaries
- Upgraded local state to schema v3, migrating older daily totals into editable history entries
- Added a stable saved playlist queue that survives local music-folder moves and keeps missing tracks visible
- Added reconnect, rescan, clear-missing, and bundled-playlist recovery actions
- Added native Media Session metadata, transport, and seeking controls; upgraded local state to schema v4
- Added focus entry/restoration, modal Tab containment, Escape handling, and hidden-surface semantics across dialogs, responsive Notes, and Queue
- Added screen-reader announcements for timer, playback, playlist, Focus Plan, and focus-history actions
- Added WCAG AA contrast checks for core dark/light UI colors and real Electron reduced-motion/accessibility-tree verification
- Added Quiet Studio, Midnight, Moss, and Paper as persisted curated scene presets
- Preserved legacy background choices and saved local media paths while keeping storage on schema v4

## 1.2.0 — 2026-09-08

- Made weather opt-in with Off, automatic IP location, and manual city modes plus clear privacy descriptions
- Added a restrictive Content Security Policy and bundled the UI fonts for offline use
- Enabled Electron renderer sandboxing, disabled production DevTools, and blocked unexpected navigation, windows, and webviews
- Added Universal macOS builds containing both Apple Silicon and Intel binaries
- Added tag-driven GitHub Release automation with checksums and idempotent asset uploads
- Upgraded electron-builder to 26.15.3 and resolved all npm audit findings
- Added the responsive Quiet Studio interface, dedicated Mini Mode, larger controls, and responsive statistics
- Replaced the custom close-mode control with native OS window controls and standard macOS close/quit behavior
- Added a visible keyboard-shortcut entry point and adaptive neutral glass surfaces for visual backgrounds
- Reworked White Scene as a warm light theme across panels, controls, statistics, shortcut help, and Mini Mode

## 1.1.0 — 2026-09-07

- Added a versioned local-data schema with automatic migration from legacy keys
- Added validated full-state backup export and restore, plus recovery guidance for corrupted or newer data
- Restored close behavior, the selected music folder, playlist order, and active timer state across relaunches
- Split renderer behavior into independently testable feature models and DOM controllers
- Extracted component styles from the HTML document into a dedicated stylesheet
- Expanded automated coverage to 21 unit tests and verified both development and packaged Electron UI flows

## 2026-09-01
- Fixed missing timer scroll helper and restored renderer initialization
- Replaced missing default media assets with generated fallback audio/background files
- Verified timer countdown, notes, player, stats drawer, and background drawer functionality
- Added README documentation for the project and runtime notes
