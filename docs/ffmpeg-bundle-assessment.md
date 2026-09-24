# Bundled FFmpeg distribution assessment

Date: 2026-09-24. Scope: the three FFmpeg 7.1 executables currently committed under `vendor/ffmpeg/` and included in v1.5.2 builds. This is a technical evidence review, not a legal opinion. No binary or published Release was changed during this review.

## Reproducible observations

The executable hashes below match `vendor/ffmpeg/manifest.json`; `scripts/verify-ffmpeg-runtimes.mjs` checks these bytes and the presence of license metadata. macOS configurations were read by executing each binary (`arch -x86_64` for Intel). The Windows configuration was extracted from embedded executable strings on macOS and still needs independent execution on Windows.

| Runtime | Bytes | SHA-256 | Observed relevant configure switches |
| --- | ---: | --- | --- |
| macOS arm64 | 49,368,728 | `6d175a4743ca50256e89a8cdd731100f9cee33bd79aeea46894d209410dc6617` | `--enable-gpl`, `--enable-libx264`, `--enable-libx265`, `--enable-libvpx`, `--enable-libopus`; no `--enable-nonfree` in printed configuration |
| macOS x64 | 75,991,688 | `4a4a968b98859588e98500ae25973d80a5ca5eed0724222b9f76360dcb72a001` | `--enable-gpl`, `--enable-version3`, **`--enable-nonfree`**, `--enable-libx264`, `--enable-libx265`, `--enable-libvpx`, `--enable-libopus` |
| Windows x64 | 87,638,016 | `2ce797a0f88d7f067180338fb227f7b1928ea727bd9a4d7a1d022f7c52af71a3` | Embedded string includes `--enable-gpl`, `--enable-version3`, `--enable-static`, `--enable-libx264`, `--enable-libx265`, `--enable-libvpx`, `--enable-libopus`; no `--enable-nonfree` in the observed string |

`manifest.json` names [imageio-ffmpeg 0.6.0](https://pypi.org/project/imageio-ffmpeg/0.6.0/) as the binary source and the [FFmpeg 7.1 source tarball](https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz) as upstream source. `LICENSE.txt` currently asserts GPL-3.0-or-later for all three and calls the upstream tarball “complete corresponding source.” These metadata statements are not proof of the exact build inputs or license obligations.

## Distribution assessment

- **High-priority unresolved issue:** The Intel macOS binary explicitly reports `--enable-nonfree`. The [FFmpeg 7.1 LICENSE](https://github.com/FFmpeg/FFmpeg/blob/n7.1/LICENSE.md) and [FFmpeg 7.1 configure script](https://github.com/FFmpeg/FFmpeg/blob/n7.1/configure) state that this option produces an unredistributable binary. The existing blanket GPL notice does not resolve this. Obtain provenance and qualified legal review before further FFmpeg-bearing distribution; do not assume the published binary is cleared merely because its hash and license file are present.
- The arm64 and Windows configurations enable GPL components. [FFmpeg's official legal guidance](https://ffmpeg.org/legal.html) explains that enabling GPL components changes FFmpeg's applicable license and provides a compliance checklist. This does **not**, by itself, establish that the entire separately invoked MIT application must be relicensed. The combined distribution and all third-party dependencies require case-specific review.
- The repository does not currently identify exact wheel artifact hashes, complete build recipes, patches, or the corresponding source/version/license material for the enabled external libraries. A generic FFmpeg upstream tarball alone may be insufficient to reproduce these particular static executables. Confirm the source-offer and notice obligations with the binary supplier and counsel; record an exact retrievable source bundle and build configuration for each platform.
- `verify:ffmpeg` confirms pinned executable hashes and that a GPL text exists. It does not validate configure flags, third-party source completeness, redistributability, or consistency of the global `GPL-3.0-or-later` manifest field with the x64 `--enable-nonfree` flag.

## Follow-up before another release

1. Resolve Intel macOS `--enable-nonfree` provenance and replace that binary with a verified redistributable build if the observed flag is accurate. Re-audit all three platform builds; execute the Windows binary on Windows to confirm its reported configuration.
2. Choose and document a minimal codec set sufficient for WebM VP8 + Opus conversion. Evaluate an LGPL-compatible build only after confirming required codecs, dependency licenses, and compatibility tests; neither a specific package-size reduction nor LGPL sufficiency is established here.
3. Pin exact binary origins and complete corresponding source/build materials, update notices and manifest per platform, and add machine-checkable license/configuration assertions where reliable.
4. Repeat macOS Universal and Windows packaging/smoke checks, then obtain separate release authorization. This assessment neither republishes v1.5.2 nor changes its binaries.
