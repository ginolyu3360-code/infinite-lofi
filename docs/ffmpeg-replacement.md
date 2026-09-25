# Source-pinned FFmpeg replacement

Date: 2026-09-25. This records the proposed replacement for the three FFmpeg executables bundled by Infinite Lo-Fi. It is a technical distribution review, **not legal advice**. The public v1.5.2 Release and its assets are unchanged; using these binaries in a new Release requires separate authorization and final compliance review.

## Inputs and build

All three executables were built from [FFmpeg 7.1](https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz), [libvpx 1.16.0](https://github.com/webmproject/libvpx/archive/refs/tags/v1.16.0.tar.gz), and [Opus 1.5.2](https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz). Exact source archive checksums, binary checksums, and per-target paths are pinned in [`vendor/ffmpeg/manifest.json`](../vendor/ffmpeg/manifest.json). Source archives are verified **before** extraction. The macOS and Windows commands are in [`scripts/build-ffmpeg-macos.sh`](../scripts/build-ffmpeg-macos.sh) and [`scripts/build-ffmpeg-windows.sh`](../scripts/build-ffmpeg-windows.sh); no source patches were applied. The build recipes download only when explicitly run; the installed application never downloads FFmpeg.

The common FFmpeg options are `--disable-gpl --disable-nonfree --disable-version3 --disable-autodetect --enable-libvpx --enable-libopus`. Other options in the build scripts select architecture, static codec linkage, and omit unused tools. `npm run verify:ffmpeg` rejects missing safe options, GPL/nonfree/version3 options, unreviewed external `--enable-lib*` dependencies, wrong executable architecture, or a checksum mismatch. It also requires the source/notice metadata. This is a guard against accidental replacement, not a proof of all license obligations.

| Target | Size | SHA-256 | Runtime dependency observation |
| --- | ---: | --- | --- |
| macOS x64 | 16,176,984 bytes | `3dc997957370f028039d4a7231e147138ab098290489be32e7813a427070c6e5` | `otool -L`: Apple system libraries only |
| macOS arm64 | 14,533,256 bytes | `ddf1536e999d911350ab8a11fbff6cab8d73472ddd8a7a48c4ab527ecf9e73a7` | `otool -L`: Apple system libraries only |
| Windows x64 | 15,204,352 bytes | `b37561029bc091520e73af4ca879aefaaef631ffe9ed653da8cebab9e1eafba8` | PE import table: Windows system DLLs and UCRT API-set DLLs only |

Both macOS architectures converted the repository's AVI and MKV fixtures into VP8/Opus WebM with the same parameters as the application. The Windows build and both conversions passed in [GitHub Actions run 36026543853](https://github.com/ginolyu3360-code/infinite-lofi/actions/runs/36026543853). That run's candidate executable was copied into `vendor/ffmpeg/win32-x64/ffmpeg.exe` and verified against its recorded hash. The recipe uses MSYS2 UCRT64, GCC, pkg-config, make, Perl, curl, and diffutils; macOS builds use Apple Clang and pkg-config. Paths embedded in configure strings are temporary build paths, so recompilation need not be byte-for-byte reproducible; source pins, recipes, flags, formats, and functionality are the reproducibility evidence.

Local verification: `npm run check` passed 185 tests; `npm run pack:universal` included both hashed macOS executables and all notices; `npm run smoke:packaged:mac` passed its end-to-end video proxy and Reader checks. `node scripts/stage-ffmpeg-sources.mjs dist` retrieved all three archives and verified their pinned hashes. The normal cross-platform PR CI is still required before merge.

## Notices and future distribution

The FFmpeg executable reports LGPL 2.1-or-later with GPL/nonfree/version3 options disabled; libvpx and Opus are BSD-style dependencies. The installed package includes `LICENSE.txt`, the complete LGPL 2.1 text, libvpx and Opus notices, `SOURCE.txt`, and the manifest. A **future authorized** tagged Release workflow stages all three pinned source archives alongside installers and records their checksums in `SHA256SUMS.txt`. This makes source available from the same Release location as the corresponding binary distribution; it does not backfill earlier Releases.

[FFmpeg's license page](https://ffmpeg.org/legal.html) and [7.1 license file](https://github.com/FFmpeg/FFmpeg/blob/n7.1/LICENSE.md) explain why disabling GPL and nonfree options matters. Its compliance checklist also raises source correspondence, build instructions, download-page and in-app notices, and other details. Because that checklist is framed around library linking, a qualified review should confirm the obligations for this separately invoked, statically linked executable and the application's actual download pages before any new public release. The new binary does not cure the already published v1.5.2 artifacts; their disposition needs a separate decision.
