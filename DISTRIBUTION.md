# macOS Distribution

## Local build

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

`.github/workflows/release.yml` runs when a `v*` tag is pushed. It requires the tag version to match `package.json`, runs the complete non-GUI checks, builds the unsigned Universal DMG and ZIP, creates `SHA256SUMS.txt`, and creates or updates the matching GitHub Release.

```bash
git tag v1.3.0
git push origin v1.3.0
```

Rerunning the workflow safely replaces assets on an existing Release instead of creating duplicates.

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
