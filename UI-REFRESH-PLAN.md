# Infinite Lo-Fi UI Refresh Plan

Status: implemented and verified on 2026-09-07

## Decision

The UI foundation will be redesigned before Phase 3 product work begins. The redesign may substantially change layout, styling, sizing, and interaction patterns while preserving existing data and feature behavior.

## Confirmed product direction

- Mini Mode will be a distinct view with an explicit toggle button.
- The main UI may be redesigned extensively; compatibility with the current visual structure is not required.
- Primary buttons, controls, sliders, and interactive rows should be comfortably clickable, with a 44 px minimum target wherever practical.
- Trackpad, touch, horizontal scrolling, and swipe-friendly interactions should be supported where they improve panel and chart use.
- The timer area must not have its own scrollbar. Core timer content must fit through responsive layout changes.
- Phase 3 features are not part of this implementation, but the new structure must leave room for daily goals, long breaks, session history, and richer statistics.

## Visual direction

Use a quiet-studio aesthetic:

- Warm charcoal surfaces instead of flat pure black.
- One restrained amber accent supported by neutral text and status colors.
- Reduced blur, glow, transparency, and grain compared with the current interface.
- Clear visual hierarchy: timer first, active task second, player third, utilities last.
- Space Grotesk for interface and primary numerals; IBM Plex Mono for compact metadata.
- Consistent surface, border, radius, spacing, shadow, and motion tokens.
- Background images and videos remain atmospheric and never reduce essential text contrast.

## Information architecture

### Full view

1. Compact top bar: local time, date, weather, Mini Mode, minimize, and close.
2. Collapsible notes workspace on the left.
3. Central focus workspace containing phase, timer, controls, and session settings.
4. Persistent player dock at the bottom of the focus workspace.
5. Consistent overlay side panels for statistics, backgrounds, playlist details, and shortcut help.

### Mini Mode

- Target size: approximately 420 × 230 px, with a hard minimum near 360 × 200 px.
- Show phase, timer, start/pause, reset, current track, play/pause, and an explicit return-to-full-view control.
- Hide notes, charts, extended settings, playlist, weather details, and decorative content.
- Preserve active timer and player state during transitions.
- Remember the previous full-window bounds and restore them when Mini Mode is exited.
- Do not persist Mini Mode across a full app relaunch in the first implementation.
- Do not add always-on-top behavior until separately requested and evaluated.

## Responsive window rules

| Range | Behavior |
| --- | --- |
| 1100 px and wider | Full two-column workspace with notes visible |
| 800–1099 px | Compact two-column workspace; notes may collapse |
| 720–799 px | Single-column focus workspace; notes and utilities open as overlays |
| 520–649 px height | Compact spacing; supporting copy and secondary controls collapse |
| Mini Mode | Dedicated 420 × 230 view, independent from full-layout breakpoints |

Full mode target bounds:

- Default: approximately 1100 × 760 px.
- Minimum: approximately 720 × 520 px.
- Content must remain usable at every supported size without overlapping, clipped controls, or nested timer scrolling.

## Timer and clock behavior

- Keep the status clock independent from the primary Pomodoro timer.
- At narrow widths, hide the date before hiding or truncating the clock.
- Weather copy may collapse to a short status without moving window controls.
- Scale the primary timer against both available width and height, not viewport width alone.
- Keep phase, time, and primary controls visible at all supported full-window sizes.
- Collapse session configuration into a compact control group at low heights.
- Remove timer scroll fades, timer-area overflow scrolling, and scrollbar-dependent interaction.
- Ensure long timer values such as `360:00` remain fully visible.

## Statistics behavior

- Use one consistent side-panel shell with a fixed header and scrollable content region.
- Separate range selection, export actions, summaries, and destructive actions.
- Use large segmented range controls with clear selected states.
- Keep Today and Week charts fitted to the available width.
- Give Month a readable minimum bar width and horizontal trackpad/touch scrolling instead of compressing 30 bars.
- Keep tooltips inside the chart panel.
- Reflow summaries from three columns to two-plus-one or a vertical stack at narrow widths.
- Reserve layout space for future daily-goal and history entry points without implementing them.

## Interaction system

- Default primary and secondary button height: 44–48 px.
- Icon-only targets: at least 40 px, preferably 44 px.
- Slider tracks and thumbs must be easy to click and drag.
- Interactive rows should expose hover, focus-visible, pressed, and selected states.
- Side panels should support closing by button, backdrop, Escape, and a clear swipe gesture when pointer/touch input makes that gesture unambiguous.
- Horizontally overflowing statistics and playlists must work with trackpad scrolling and touch panning.
- Motion should be short and consistent and must respect `prefers-reduced-motion`.

## Implementation stages

1. Replace layout primitives and introduce visual tokens without changing feature behavior.
2. Rebuild the full-view shell, top bar, notes workspace, timer card, and player dock.
3. Add the native-window Mini Mode bridge and dedicated renderer state.
4. Rebuild timer and status-clock responsive rules and remove timer scrolling.
5. Rebuild the statistics side panel and chart overflow behavior.
6. Normalize backgrounds, playlist, shortcut help, forms, sliders, and destructive actions.
7. Add safe swipe/pointer interactions and reduced-motion behavior.
8. Extend automated smoke checks across representative window sizes and both full/Mini modes.

## Acceptance criteria

- No overlap, clipping, unreachable control, or timer scrollbar at supported sizes.
- Full mode works at 720 × 520, 800 × 600, 1100 × 760, and 1440 × 900.
- Mini Mode works at its target and minimum bounds and returns to the previous full bounds.
- Primary controls meet the target sizing rules and remain keyboard accessible.
- Month statistics remain readable and horizontally scrollable on small widths.
- Notes, player, background, weather, backup, restore, and close behavior remain functional.
- Reduced-motion mode removes nonessential transitions.
- Existing unit tests pass; new layout and Mini Mode tests are added.
- Development and Universal packaged-app smoke tests pass with isolated profiles and no renderer exceptions.

## Out of scope

- Phase 3 product features.
- Framework migration.
- Accounts, cloud sync, or backend work.
- Signing and notarization.
- Always-on-top Mini Mode.
- Replacement of final music and background media assets unless handled as a separate approved content task.
