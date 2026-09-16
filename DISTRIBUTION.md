# Desktop Distribution

## macOS local build

From the project root:

```bash
npm ci
npm run dist
```

The output is created in `dist/`:

- `Infinite-Lo-Fi-<version>-universal.dmg`: Universal installer image
- `Infinite-Lo-Fi-<version>-universal.zip`: zipped Universal application
- `mac-universal/Infinite Lo-Fi.app`: unpacked Universal `.app` bundle

The default build contains both Intel (`x86_64`) and Apple Silicon (`arm64`) code. Architecture-specific builds remain available:

```bash
npm run dist:x64
npm run dist:arm64
npm run dist:universal
```

Published builds are available from the [GitHub Releases page](https://github.com/ginolyu3360-code/infinite-lofi/releases). Version 1.1.0 remains the last Intel-only release; 1.2.0 and later default to Universal artifacts.

## Automated releases

`.github/workflows/release.yml` runs when a `v*` tag is pushed. It requires the tag version to match `package.json`, runs the complete checks plus isolated development and packaged UI smoke tests on macOS and Windows, builds the unsigned Universal DMG/ZIP and Windows x64 NSIS EXE, creates `SHA256SUMS.txt`, and creates a draft GitHub Release.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Before publishing the draft, download every asset, verify its SHA-256 entry, confirm the expected version and architecture, and complete any required physical Windows checks against the actual candidate. Rerunning the workflow replaces same-named assets on an existing draft with `--clobber` and refuses to overwrite an already published Release; repeat the affected verification after any replacement.

## First launch on macOS

Builds are intentionally unsigned in the current project scope. If Gatekeeper blocks the app:

1. Open the DMG and drag **Infinite Lo-Fi** to Applications.
2. Control-click the app in Finder and choose **Open**.
3. Confirm **Open** in the macOS dialog.

For a local app that has already been trusted incorrectly, remove the quarantine attribute only for that local copy:

```bash
xattr -d com.apple.quarantine "/Applications/Infinite Lo-Fi.app"
```

## Optional future signing

If the project later adopts signed distribution, configure an Apple Developer ID Application certificate and notarization credentials for electron-builder. Signing and notarization are intentionally not automated because they require private developer credentials.

Recommended release checks:

```bash
npm run dist
codesign --deep --verify --verbose "/Applications/Infinite Lo-Fi.app"
spctl --assess --type execute --verbose "/Applications/Infinite Lo-Fi.app"
```

Do not commit certificates, passwords, API keys, or notarization credentials to the repository.

## Windows x64 local build

Build on 64-bit Windows with Node.js 22:

```bash
npm ci
npm run dist:win
```

The output is created in `dist/`:

- `Infinite-Lo-Fi-<version>-x64.exe`: assisted NSIS installer
- `win-unpacked/Infinite Lo-Fi.exe`: unpacked application created by `npm run pack:win`

The installer is per-user, allows the destination directory to be changed, and creates desktop and Start Menu shortcuts. Uninstalling preserves the application data under `%APPDATA%/infinite-lofi-desktop`; use the application's own reset or backup controls before manually deleting that directory.

The Windows beta is intentionally unsigned. SmartScreen may show an unknown-publisher warning, and managed computers may prevent it from running. Do not distribute the unsigned build broadly. Verify the matching entry in `SHA256SUMS.txt` before running a downloaded artifact.

## Windows verification

Run the unpacked packaged smoke test on Windows with:

```bash
npm run pack:win
npm run smoke:packaged:win
```

Before a public release, also verify installation, upgrade, uninstall, tray behavior, native media controls, local folders containing non-ASCII characters, display scaling, sleep/resume, and Defender/SmartScreen behavior on a physical Windows 11 x64 computer.

Automatic desktop-wallpaper discovery currently remains macOS-only. On Windows the unavailable control is hidden, while local image and video import continue to work.
