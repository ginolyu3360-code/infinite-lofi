# Changelog

## 1.2.0 — Unreleased

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
