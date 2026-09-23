# Bundled FFmpeg runtime

Infinite Lo-Fi bundles fixed, static FFmpeg executables for macOS x64/arm64 and
Windows x64. `manifest.json` pins each executable's build provenance and SHA-256.
Packaging runs `scripts/verify-ffmpeg-runtimes.mjs`; missing or modified binaries
cause the build to fail. The application never downloads FFmpeg at runtime.
