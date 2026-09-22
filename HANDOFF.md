# Infinite Lo-Fi Handoff

Updated: 2026-09-22

## Start of the next session

1. Use `/Users/lvjunhao/Documents/GitHub/infinite_lofi` as the only canonical checkout. Do not create another checkout or worktree unless the user explicitly requests isolation.
2. Begin by checking the working tree, current branch, `main`, tags, and the latest GitHub CI/Release status. Preserve any user changes.
3. Third-party provider Slice 0 and the provider-neutral part of Slice 1 are now implemented on `codex/external-player-mode`. Read `docs/third-party-music-feasibility.md` before selecting a provider.
4. Before selecting an integration, research the current official documentation, account requirements, playback restrictions, platform support, and commercial terms for the candidate providers. These details change and must not be assumed from memory.
5. Continue the normal delivery workflow for future implementation: `codex/` feature branch → Pull Request → passing Windows/macOS CI → squash merge. A version tag or Release still requires a separate explicit instruction.

## Current baseline

- Branch: `main`; exact current commit: `a10fc3f` (`test: wait for renderer after smoke reload (#41)`).
- Package version and latest public release: `v1.5.1`. The annotated tag peels to `a10fc3f`.
- [Release v1.5.1](https://github.com/ginolyu3360-code/infinite-lofi/releases/tag/v1.5.1) is public, non-draft, and non-prerelease. Release workflow `35351586911` passed and published:
  - unsigned macOS Universal DMG and ZIP for Intel and Apple Silicon;
  - Windows x64 NSIS installer;
  - `SHA256SUMS.txt`.
- Release-preparation [PR #40](https://github.com/ginolyu3360-code/infinite-lofi/pull/40) and the Windows packaged-smoke race repair [PR #41](https://github.com/ginolyu3360-code/infinite-lofi/pull/41) are merged.
- The external-player feature work is based directly on `a10fc3f` in branch `codex/external-player-mode`; the package version remains 1.5.1 and no release tag is part of this work.
- The current player supports bundled music, explicitly selected local folders, duplicate filtering, persistent Queue order, Repeat One, Shuffle, Mini controls, audio fades, a separate bundled ambient layer, and native media controls.
- Optional lyrics prefer same-name `.lrc` and embedded lyrics, then use confidence-ranked LRCLIB and QQ Music matching with a lyrics.ovh fallback. Lyrics, instrumental classifications, and misses are cached locally. Online lookup remains opt-in and never uploads audio or local paths.
- macOS native Now Playing/AirPods ownership is deliberate. Local playback registers Infinite Lo-Fi as the media owner so paused AirPods Play resumes this app instead of Apple Music.
- Releases remain unsigned and unnotarized. Do not imply Apple signing or notarization.

## Proposed next feature: third-party playback and playlists

### 2026-09-22 implementation update

- Slice 0 is complete in `docs/third-party-music-feasibility.md`, using current official sources only. Apple Music and Spotify have documented playlist and playback surfaces with substantial membership/subscription/quota/commercial constraints; QQ Music's reviewed official surfaces are scoped to AI skills or IoT/partner products; no suitable public NetEase desktop developer product was established.
- The provider-neutral External Player Mode foundation is implemented without connecting an account or selecting a provider. Local/External mode is additive schema-v5 state and backup data; remote playlists are not written into the local Queue.
- External mode pauses local music, disables local-only controls and shortcuts, clears Chromium Media Session state, and destroys the macOS native media bridge so AirPods/media keys remain with the external player. Local mode recreates the native bridge and metadata ownership without autoplay.
- A capability-based backend contract is present for later provider adapters. The external placeholder intentionally advertises no transport, playlist, account, or status capability until an official provider adapter exists.
- No OAuth client, token, keychain entry, remote API request, audio cache, tag, or Release is part of this slice.
- Local verification passes 153 unit/controller tests, syntax checks, the development Electron smoke, Universal macOS packaging, and the packaged-app smoke. Both smoke paths cover Local → External → Local, pause/no-autoplay, persisted state, disabled local controls, browser-session cleanup, native bridge release/reacquisition, 44 px source controls, lyrics layout, and the existing responsive/accessibility/performance suite.

### User goal

Let users use music from another music service with Infinite Lo-Fi. Possible meanings must be separated before implementation:

| Experience | Audio owner | What Infinite Lo-Fi does | Complexity |
| --- | --- | --- | --- |
| External Player Mode | The provider's installed app or web player | Opens or selects provider content and exposes supported transport/status controls | Lowest and safest |
| Provider Playlist Mode | Usually the provider | Lets users connect an account and browse/select their provider playlists inside Infinite Lo-Fi | Medium; requires official OAuth/API support |
| In-app Online Playback | Infinite Lo-Fi or an official embedded SDK | Streams provider audio inside the existing player | Highest; DRM, SDK, subscription, policy, and platform restrictions apply |

These are not interchangeable. Importing playlist metadata does not automatically grant permission or a technical path to stream the tracks.

### Recommended product direction

Use a phased provider-adapter design:

1. **Discovery and provider selection** — confirm the user's first provider and desired experience, then verify only official integration paths.
2. **External Player Mode MVP** — add a clear Local/External playback source choice. When external mode is active, the provider keeps audio and operating-system media ownership.
3. **One official provider pilot** — if the provider offers suitable OAuth and playback APIs, add account connection, playlist browsing, current-track state, and supported transport operations.
4. **Evaluate embedded online playback separately** — implement only if the provider explicitly supports Electron/desktop embedding and the account/subscription requirements are acceptable.
5. **Add further providers through the same capability interface** — do not pretend every provider supports the same operations.

The default recommendation is to prove the architecture with one officially supported provider before attempting several services. Spotify is a likely technical research candidate because it has documented account and playback APIs, but it must not be selected automatically; availability, subscription requirements, and the user's actual service preference should decide. Apple Music, QQ Music, and NetEase Cloud Music must each be evaluated independently against their current official offerings.

### Decisions to obtain from the user first

1. Is the priority controlling an already-open third-party app, browsing the user's playlists inside Infinite Lo-Fi, or hearing the provider's audio directly inside Infinite Lo-Fi?
2. Which provider should be first: Apple Music, Spotify, QQ Music, NetEase Cloud Music, or another named service?
3. Should the first version target macOS only, or must macOS and Windows ship together?
4. Is requiring provider login, OAuth consent, a paid subscription, or a developer application acceptable?

Recommended defaults if the user has no preference: external/player-owned playback first, one provider only, both operating systems considered in the interface but only capabilities proven by official APIs implemented.

## Proposed architecture

### Playback backend contract

Keep local playback as one backend and add provider backends behind a small capability-based contract. A provider must explicitly advertise what it supports rather than receiving fake or disabled behavior.

Suggested responsibilities:

- connect, disconnect, and report authentication state;
- report capabilities such as playlists, play, pause, next, previous, seek, volume, and current-track state;
- list playlists and load a selected playlist when officially supported;
- expose current playback state through polling or provider events with bounded frequency;
- cancel stale requests so an old provider response cannot replace a newer user selection;
- normalize provider track metadata without treating it as a local file.

Do not force provider queues into the existing local-file persistence format. Store a lightweight provider reference, such as provider ID and playlist ID, while the provider remains authoritative for the remote playlist.

### Media ownership and AirPods behavior

This is the most important regression boundary:

- In Local mode, keep the existing native macOS media bridge and Media Session behavior.
- In External Player Mode, Infinite Lo-Fi must unregister/clear its native Now Playing ownership and must not intercept AirPods commands. The provider app should remain the operating-system media owner.
- If Infinite Lo-Fi remotely controls a provider through an API, avoid publishing a second competing media session unless the provider's official integration model explicitly requires it.
- Switching back to Local mode must restore Infinite Lo-Fi ownership only when local playback is selected, without launching Apple Music or resuming stale audio.

### Authentication and privacy

- Use the provider's official OAuth flow in the system browser with PKCE where supported.
- Keep refresh/access tokens out of localStorage, exported backups, logs, renderer messages, and crash text. Store secrets in the operating-system credential store through the main process.
- Persist only non-sensitive preferences and stable provider/playlist identifiers needed to restore the UI.
- Make network access and account connection explicit, disconnectable, and clearly described.
- Keep the renderer sandbox and restrictive CSP. Provider network requests should use narrowly allowlisted main-process/provider modules rather than arbitrary renderer access.
- Never ask users to paste cookies, scrape a logged-in browser, hardcode credentials, bypass DRM, or depend on an unofficial proxy/API for playback.
- Do not download, permanently cache, export, or redistribute provider audio unless official terms explicitly allow it.

### Timer, Queue, lyrics, and ambience behavior

- Timer-triggered music actions should target only the currently selected backend and only when the user has enabled that behavior. A failed or expired provider session must not affect the timer.
- Keep local and provider Queue concepts visibly distinct. Do not merge a remote playlist and local files into one persisted queue in the first slice.
- The separate bundled ambient layer may continue alongside provider playback only after checking that transport commands do not accidentally pause the wrong owner. Default to preserving its current independent behavior.
- If a provider exposes title, artist, album, and duration, the existing lyrics service may use that metadata only when the Lyrics switch is enabled. Do not send provider account IDs, playlist IDs, tokens, or audio to lyric services.
- Provider artwork and metadata need bounded caches, clear expiry, and no secret-bearing URLs in backups.

## Suggested implementation slices

### Slice 0 — official API feasibility report

No product code. Compare the user's chosen providers using current official sources:

- OAuth/developer-account requirements;
- free versus paid subscription restrictions;
- playlist-read permissions;
- playback-control permissions;
- whether starting playback requires an active device/provider app;
- desktop/Electron playback SDK availability;
- macOS and Windows parity;
- rate limits, review requirements, branding rules, and commercial restrictions.

Deliver a recommendation and reject providers that require cookie extraction, reverse engineering, DRM workarounds, or unstable unofficial endpoints.

### Slice 1 — backend boundary and External Player Mode

- Extract the existing local player behind a tested backend interface without changing behavior.
- Add Local/External source state and UI with accessible status and error handling.
- Implement provider deep-link/open behavior and only the officially available transport/status capabilities.
- Release native media ownership when external mode becomes active and reacquire it safely when returning to Local mode.
- Keep storage schema and backup migration additive and backward compatible.

### Slice 2 — one provider's account and playlists

- Add official OAuth connection/disconnection.
- Browse a bounded, paginated playlist list.
- Select a playlist and show its provider-owned tracks without copying the complete catalog into permanent app state.
- Add token refresh, revoked-permission, offline, rate-limit, and missing-device states.
- Make unsupported controls visibly unavailable based on reported capabilities.

### Slice 3 — optional official online playback

- Proceed only if Slice 0 confirms an official desktop/Electron-compatible playback path.
- Keep DRM/licensed playback inside the provider's supported SDK or surface.
- Define seeking, volume, fades, Repeat/Shuffle, Queue authority, media ownership, and timer behavior specifically for that provider.
- If official embedded playback is unavailable, retain provider-owned playback instead of simulating streaming with scraped URLs.

## Test and acceptance plan

- Unit tests for backend capability mapping, state normalization, authentication expiry, cancellation, retry bounds, provider switching, and secret exclusion from persistence/backups.
- Contract tests using fake providers; ordinary tests and CI must not require a real user account or contact live services.
- Regression tests proving Local mode, AirPods/native controls, Queue, lyrics opt-in, timer actions, ambience, backup restore, and paused startup remain unchanged.
- Development and packaged smoke tests for macOS Universal and Windows x64, including switching Local → External → Local and verifying media ownership cleanup.
- A short manual acceptance checklist for real OAuth, real playlists, external-app/device availability, physical AirPods/media keys, account revocation, and provider-specific subscription behavior.

The first provider slice is complete only when a user can connect through an official flow, select supported provider content, control or start playback through the documented provider path, disconnect cleanly, and return to local playback without Apple Music hijacking controls or exposing credentials.

## Explicit non-goals for the first implementation

- Supporting several providers at once.
- Reverse-engineered QQ Music or NetEase playback endpoints, copied browser cookies, unofficial login proxies, or DRM bypasses.
- Downloading provider tracks for offline use.
- Combining remote and local tracks into one permanent cross-provider Queue.
- Crossfading between local and provider-owned playback.
- Publishing duplicate operating-system media sessions.
- Provider-independent promises for seek, volume, Repeat, Shuffle, or playlist editing when an API does not support them.
- Creating a version tag or Release as part of feature implementation without a separate user instruction.

## Historical reference

Detailed completed Phase 0–4 planning and evidence remain available in Git history, `ROADMAP.md`, `verification-log.md`, and the merged PRs. They should not be reread in full for this next feature unless a specific subsystem or historical decision needs investigation.
