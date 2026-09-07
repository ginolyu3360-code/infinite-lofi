# Changelog

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
