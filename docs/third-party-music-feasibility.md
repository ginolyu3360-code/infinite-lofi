# Third-party music feasibility

Updated: 2026-09-22

This report uses current official documentation only. It intentionally excludes copied browser cookies, private or reverse-engineered endpoints, audio-URL extraction, unofficial playback proxies, DRM workarounds, and permanent caching of provider audio.

## The three product experiences are different

| Experience | Audio owner | Account/API needed | What is feasible now |
| --- | --- | --- | --- |
| Control an already-open provider player | Provider app or web player | Only if the provider publishes a remote-control API | Infinite Lo-Fi can safely yield OS media ownership now. Provider-specific controls require a later official adapter. |
| Browse the user's playlists in Infinite Lo-Fi | Usually the provider | User authorization plus an official playlist API | Officially documented for Apple Music and Spotify, but each has material account, token, quota, and distribution constraints. |
| Stream provider audio inside Infinite Lo-Fi | Provider SDK/player | Official licensed playback surface and normally a paid subscription | Potentially possible with MusicKit on the Web or Spotify Web Playback SDK, but neither currently documents Electron as a supported host. This needs a separate legal and packaged-runtime proof before implementation. |

Playlist metadata never grants playback rights. A provider app being available on macOS or Windows also does not imply that another desktop app may control it.

## Capability comparison

| Provider | Authorization and developer access | Read user playlists | Control provider playback | Active device / subscription | Electron and desktop playback | Platform parity | Review, brand, and commercial limits | Current verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Apple Music | MusicKit uses a Media ID, Media Services private key, developer token, and user authorization/music user token. Creating the key requires an Apple Developer team Account Holder or Admin. Apple Developer Program membership is currently USD 99/year. | Yes. `GET /v1/me/library/playlists` is paginated and requires a music user token. | MusicKit players can set queues and play/pause their own session. The reviewed official docs do not expose a cross-platform API for remotely controlling the installed Apple Music desktop app. | Full catalog playback requires an active Apple Music subscription; MusicKit can check subscription eligibility. A separate already-active Apple Music desktop device is not required for MusicKit's own player. | Apple documents native MusicKit for macOS and MusicKit on the Web for browser websites. It does not explicitly list Electron as supported. A private signing key must never ship in the desktop bundle, so production developer-token issuance may require a small trusted service. | Native MusicKit is Apple-platform only. Web playback is the only documented common macOS/Windows path; Apple also ships a Windows consumer app, but that app is not an integration SDK. | Apple terms prohibit downloading/uploading/modifying MusicKit content and synchronizing it with other content except where documentation permits. App naming shown during authorization comes from the registered Media ID. | Viable research candidate for playlists and licensed playback only if Apple membership, token service, subscription requirement, and an Electron proof are acceptable. Not a safe generic external-app-control API. |
| Spotify | OAuth 2.0 is documented; desktop/mobile/JavaScript clients should use Authorization Code with PKCE so no client secret is stored in the app. The current Web API overview says Premium is required. | Yes. `GET /me/playlists` is paginated; private and collaborative lists require their specific read scopes. | Yes for Spotify clients/Connect devices through playback scopes. Start/resume targets the active device unless a `device_id` is supplied. | Playback control and streaming require Premium. Development mode currently requires the app owner to have Premium, allows up to five allowlisted users, and can fail when no suitable active device exists. The Web Playback SDK can create a browser Connect device. | The Web Playback SDK supports major desktop browsers on macOS, Windows, and Linux, but the official support list does not name Electron. Packaged EME/DRM behavior needs proof. | Browser SDK and Web API are cross-platform in principle; installed Spotify clients are available separately. | New apps start in development mode. Extended quota is currently limited to organizations meeting requirements including an established entity, a launched service, and at least 250k MAU, followed by review. Streaming apps may not be commercial without prior written approval; Spotify attribution/branding and content restrictions apply. | Best documented PKCE/API pilot for a private five-user test, but a poor default for public distribution by an individual under current quota rules. Embedded playback is a separate, approval-sensitive experiment. |
| QQ Music | A recent official QQ Music skill uses an API key for search, recommendations, reports, and playlist details. Separately, Tencent Cloud documents QQ Music authorization and playback URLs inside the Tencent Lianlian custom-H5/IoT product. The official QPlay demo expects app/device credentials supplied by the OpenAPI administrator to partners. None of these documents a self-service general Electron authorization product. | Yes inside the official skill surface and Tencent Lianlian/QPlay partner contexts; this cannot be assumed to authorize a general desktop application. | Tencent Lianlian can send playlists to its IoT devices. No reviewed official document exposes generic control of the installed QQ Music desktop client. | Tencent Lianlian says the authenticated device can use the user's listening data and membership rights. Requirements outside that product are not documented publicly. | No reviewed official desktop/Electron playback SDK for an independent app. The documented playable URL surface is scoped to Tencent Lianlian H5/IoT and must not be repurposed. | The reviewed integration products are IoT/H5 or partner hardware rather than a documented macOS/Windows desktop SDK. | QQ Music service terms require provider-recognized use and prohibit unauthorized third-party tools, reverse engineering, and third-party systems used to log in to or access the service. | Reject for a general desktop provider pilot unless Tencent/TME grants a documented partnership specifically covering this app. The official AI skill may be revisited for non-playback metadata only after its redistribution terms are clear. |
| NetEase Cloud Music | No public, self-service official developer documentation was found for third-party desktop OAuth, user-library access, playback control, or embedded playback. Search results claiming these abilities were unofficial wrappers or descriptions of private partner APIs and are therefore excluded. | Not established from public official documentation. | Not established from public official documentation. | Not established from public official documentation. Consumer membership behavior cannot be treated as developer authorization. | No reviewed official Electron or desktop playback SDK. | Consumer apps are a separate matter; no official integration parity was established. | Without public integration terms, review rules, rate limits, or brand guidance, the project cannot responsibly implement an account or playback adapter. | Reject unless NetEase supplies current partner documentation and explicit permission. Do not use community APIs, cookies, reverse-engineered login, or audio URL proxies. |

## Recommendation

1. Ship the provider-neutral Local/External Player Mode foundation first. External mode must pause local music, clear browser Media Session state, destroy the macOS native remote-command bridge, and leave provider audio/system ownership untouched. Returning to Local recreates ownership but does not autoplay.
2. Do not expose provider login, playlists, or playback yet. The first provider materially changes credentials, server requirements, distribution limits, and product copy.
3. If the goal is a private technical pilot, Spotify is the clearest first adapter because PKCE, playlists, current playback, and Connect controls are documented. Treat the five-user Premium development limit as a hard product constraint.
4. If the goal is in-app Apple Music playback, first accept Apple Developer membership, a secure developer-token strategy, active-subscriber-only playback, and an Electron compatibility spike. Do not embed the Media Services private key.
5. QQ Music and NetEase Cloud Music remain external-player-only unless the provider grants a suitable official desktop partnership.

## Official sources reviewed

### Apple

- [MusicKit overview](https://developer.apple.com/musickit/)
- [Get All Library Playlists](https://developer.apple.com/documentation/applemusicapi/get-all-library-playlists)
- [MusicKit on the Web user authorization and controls](https://developer.apple.com/musickit/web/?path=%2Fstory%2Fuser-authorization--page)
- [Create a media identifier and private key](https://developer.apple.com/help/account/capabilities/create-a-media-identifier-and-private-key)
- [Apple Developer Program membership details](https://developer.apple.com/programs/whats-included/)
- [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [Apple Music for Windows user guide](https://support.apple.com/guide/music-windows/welcome/windows)

### Spotify

- [Authorization and PKCE](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [Get Current User's Playlists](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists)
- [Start/Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
- [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [Developer Policy](https://developer.spotify.com/policy)
- [Design and branding guidelines](https://developer.spotify.com/documentation/design)

### QQ Music / Tencent

- [Official QQ Music skill](https://github.com/tencentmusic/qqmusic-skills)
- [Tencent Lianlian IoT music service](https://cloud.tencent.com/document/product/1081/67456)
- [Official QPlay OpenAPI demo](https://github.com/tencentmusic/QQMusic_Innovation_QPlay_OpenAPI_Demo)
- [Tencent Music service agreement](https://www.tencentmusic.com/zh-cn/protocol.html)

### NetEase Cloud Music

- [NetEase Cloud Music service terms](https://music.163.com/html/web2/service.html)
- [NetEase Cloud Music consumer site](https://music.163.com/)

The absence conclusion for NetEase is deliberately narrow: no suitable public official developer product was located on 2026-09-22. It is not a claim that private partner programs do not exist.
