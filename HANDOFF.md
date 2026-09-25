# Infinite Lo-Fi Handoff

Updated: 2026-09-25

## Start of the next session

1. Check the working tree, branch, current `origin/main`, tags, and latest GitHub CI/Release status before changing anything. Worktrees based on synchronized `origin/main` are permitted; preserve changes in every checkout and do not clean unrelated worktrees automatically.
2. The old `codex/local-video-playback` notes below describe work that was subsequently merged and released. They are history, not a local-only restriction or a current baseline.
3. Continue normal delivery through a `codex/` branch, PR, passing macOS and Windows CI, squash merge, and exact-merge `main` CI. The user explicitly authorized v1.5.3 in this release round; later versions still require separate direction.
4. Read the [historical FFmpeg audit](docs/ffmpeg-bundle-assessment.md) and [replacement evidence](docs/ffmpeg-replacement.md) before distributing another FFmpeg-bearing build. The published v1.5.2 binaries remain unchanged; replacement on `main` does not retroactively repair that Release.

## Current baseline

- Public baseline: v1.5.2, merged through [PR #42](https://github.com/ginolyu3360-code/infinite-lofi/pull/42) as `5f793aa4991ccd27b924373363f92395e855aeef`. The PR's macOS/Windows CI [35850802450](https://github.com/ginolyu3360-code/infinite-lofi/actions/runs/35850802450), exact-merge main CI [35851145099](https://github.com/ginolyu3360-code/infinite-lofi/actions/runs/35851145099), and [Release workflow 35851641833](https://github.com/ginolyu3360-code/infinite-lofi/actions/runs/35851641833) passed.
- [Release v1.5.2](https://github.com/ginolyu3360-code/infinite-lofi/releases/tag/v1.5.2) published unsigned macOS Universal DMG/ZIP, Windows x64 NSIS EXE, and `SHA256SUMS.txt`. The v1.5.3 package update in this branch is a release candidate until its tag workflow succeeds.
- [FFmpeg replacement PR #44](https://github.com/ginolyu3360-code/infinite-lofi/pull/44) merged as `2347446`; exact-merge [main CI 36090895177](https://github.com/ginolyu3360-code/infinite-lofi/actions/runs/36090895177) passed both platforms. The three replacement executables, notices, source pins, and future source-archive staging are on `main`.
- The current player supports bundled music, selected local audio/video folders, persistent Queue order, Repeat One, Shuffle, Mini controls, audio fades, ambient sound, and native media controls. Video supports native containers and on-demand cached WebM compatibility copies; video can remain audio-only or appear in the Scene background without resetting playback.
- Reader combines documents from the current media folder and an independent reading folder, locally and read-only. External Player Mode is a source/ownership switch, not a provider account or embedded third-party playback integration.
- Optional lyrics prefer same-name `.lrc` and embedded lyrics. For Chinese tracks, online lookup tries QQ Music before LRCLIB; other tracks use LRCLIB before QQ Music, with lyrics.ovh fallback. Lookup remains opt-in and does not upload local audio or paths.
- macOS native Now Playing/AirPods ownership is deliberate. Local playback registers Infinite Lo-Fi as the media owner so paused AirPods Play resumes this app instead of Apple Music.
- Releases remain unsigned and unnotarized. Do not imply Apple signing or notarization.

## Historical provider-integration proposal (written before v1.5.2)

The implementation notes below were recorded before the v1.5.2 merge and Release. Their local-only status, test totals, and unpublished-feature statements are historical. The current baseline above takes precedence. Provider integration still requires separate product choice and fresh official-source review.

### 2026-09-22 implementation update

- Slice 0 is complete in `docs/third-party-music-feasibility.md`, using current official sources only. Apple Music and Spotify have documented playlist and playback surfaces with substantial membership/subscription/quota/commercial constraints; QQ Music's reviewed official surfaces are scoped to AI skills or IoT/partner products; no suitable public NetEase desktop developer product was established.
- The provider-neutral External Player Mode foundation is implemented without connecting an account or selecting a provider. Local/External mode is additive schema-v5 state and backup data; remote playlists are not written into the local Queue.
- External mode pauses local music, disables local-only controls and shortcuts, clears Chromium Media Session state, and destroys the macOS native media bridge so AirPods/media keys remain with the external player. Local mode recreates the native bridge and metadata ownership without autoplay.
- A capability-based backend contract is present for later provider adapters. The external placeholder intentionally advertises no transport, playlist, account, or status capability until an official provider adapter exists.
- No OAuth client, token, keychain entry, remote API request, audio cache, tag, or Release is part of this slice.
- Local verification passes 153 unit/controller tests, syntax checks, the development Electron smoke, Universal macOS packaging, and the packaged-app smoke. Both smoke paths cover Local → External → Local, pause/no-autoplay, persisted state, disabled local controls, browser-session cleanup, native bridge release/reacquisition, 44 px source controls, lyrics layout, and the existing responsive/accessibility/performance suite.

### 2026-09-23 local video implementation update

- Local folder scanning now accepts MP4, M4V, and WebM alongside the existing audio formats. Queue snapshots and backups persist a normalized audio/video media kind without a schema-version bump.
- The shared local media element plays both audio and video. Video defaults to audio-only; the persisted Video background switch reveals the same element behind the interface without resetting playback or changing the saved Scene.
- A visible seven-language error explains unsupported containers/codecs. Queue entries identify video files, External mode pauses and hides local video, and returning to Local remains paused.
- Verification passes 159 tests, syntax/build checks, development Electron smoke, Universal macOS packaging, and packaged-app smoke. Both smoke paths use a generated 17 KB VP8/Opus WebM fixture to verify decoding, audible unmuted playback, continuous time across display-mode changes, Scene-video suspension, 720×520 layout, persistence, and Local → External → Local behavior.
- This feature has not been pushed, submitted, merged, tagged, or released.

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
