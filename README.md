# Infinite Lo-Fi

A minimal desktop pomodoro app built with Electron, plain renderer logic, and Tailwind-based styling.

## Features
- Focus and break timer with countdown updates
- Local notes with multiple note tabs and pinning
- Music player with playlist and local folder loading
- Weather display and live clock
- Stats dashboard for focus history
- Background modes for black, white, wallpaper, image, and video
- Tray and close mode behavior

## Run
```bash
npm install
npm start
```

## Build macOS App
Build the macOS DMG, ZIP, and application bundle with:

```bash
npm run dist
```

The files are written to `dist/`:

- `Infinite Lo-Fi-1.0.0.dmg` for installation
- `Infinite Lo-Fi-1.0.0-mac.zip` for direct extraction
- `mac/Infinite Lo-Fi.app` for the unpacked application bundle

The app includes a custom macOS icon from `assets/icon.icns`. Builds from a machine without an Apple Developer ID certificate are unsigned, so macOS may require Control-clicking the app and choosing **Open** the first time.

For local development packaging without creating installers:

```bash
npm run pack
```

## Project status
- Verified startup and renderer initialization
- Verified timer countdown works
- Verified note creation and editing works
- Verified stats and background drawers open correctly
- Verified audio element loads default local media asset

## Known notes
- Some weather providers may return 403/failed responses; the app falls back to cached or alternate providers.
- macOS may print Electron input-method warnings during startup; this is typically non-fatal and not a crash.
- Production signing and notarization require an Apple Developer account, a Developer ID Application certificate, and notarization credentials.
