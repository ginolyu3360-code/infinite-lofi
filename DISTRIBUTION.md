# macOS Distribution

## Local build

From the project root:

```bash
npm install
npm run dist
```

The output is created in `dist/`:

- `Infinite Lo-Fi-1.0.0.dmg`: installer image
- `Infinite Lo-Fi-1.0.0-mac.zip`: zipped application
- `mac/Infinite Lo-Fi.app`: unpacked `.app` bundle

The build currently targets Intel macOS with `--x64`, matching the configured `dist` script. To produce an Apple Silicon build on a compatible machine, use the equivalent builder target with `--arm64`.

## First launch on macOS

Local builds are unsigned unless an Apple Developer ID certificate is available. If Gatekeeper blocks the app:

1. Open the DMG and drag **Infinite Lo-Fi** to Applications.
2. Control-click the app in Finder and choose **Open**.
3. Confirm **Open** in the macOS dialog.

For a local app that has already been trusted incorrectly, remove the quarantine attribute only for that local copy:

```bash
xattr -d com.apple.quarantine "/Applications/Infinite Lo-Fi.app"
```

## Signed release

Before publishing to other users, configure an Apple Developer ID Application certificate and notarization credentials for electron-builder. Signing and notarization are intentionally not automated in this repository because they require private developer credentials.

Recommended release checks:

```bash
npm run dist
codesign --deep --verify --verbose "/Applications/Infinite Lo-Fi.app"
spctl --assess --type execute --verbose "/Applications/Infinite Lo-Fi.app"
```

Do not commit certificates, passwords, API keys, or notarization credentials to the repository.