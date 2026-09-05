# Infinite Lo‑Fi（中文 / English）

> 中文部分在上方，英文部分在下方（双语说明）。

---

# Infinite Lo‑Fi（中文说明）

一个极简的桌面番茄钟 + 环境音乐播放器，基于 Electron 与 Tailwind CSS 构建。提供专注/休息计时、局部笔记、音乐播放（支持加载本地文件夹并提取嵌入封面）、背景模式、托盘交互与统计面板，适合想要低干扰背景音乐与简单专注工具的用户。

## 主要特性
- 番茄专注 / 休息计时器，支持开始/暂停/重置与托盘显示
- 本地笔记（多标签、置顶）
- 音乐播放器：内置示例曲目 + 支持选择本地音乐文件夹并扫描音频文件与封面
- 背景模式：黑/白/壁纸/图片/视频
- 托盘图标与“最小化到托盘”行为
- 实时时钟、天气与简单统计面板
- macOS 打包配置（electron-builder，含 .icns 图标）

## 技术栈
- 语言：JavaScript（Electron 主进程 + 预计的 renderer）
- 运行时 / 框架：Electron（项目 devDependencies 中为 electron）
- 关键库：
  - tailwindcss — UI 样式与构建
  - electron-builder — 打包 macOS 应用
  - music-metadata — 读取音频元数据与嵌入封面
  - concurrently — 并行运行开发脚本

## 仓库结构（重要文件）
```
.gitignore
CHANGELOG.md
DISTRIBUTION.md
LICENSE
README.md
inifinite_lofi.code-workspace
main.js                 # Electron 主进程入口，托盘、IPC、音乐扫描等逻辑都在这里
preload.js              # contextBridge：主进程与 renderer 的安全桥
package.json            # 脚本、依赖、打包配置
tailwind.config.js
verification-log.md
assets/                 # 内置资源：图标、示例音轨、托盘模板、背景等
  ├─ icon.icns
  ├─ icon.png
  ├─ trayTemplate.png
  ├─ background.jpg
  ├─ track-01.wav
  ├─ track-02.wav
  └─ track-03.wav
```

注意：main.js 会加载 `src/index.html`（通过 `mainWindow.loadFile(path.join(__dirname, "src", "index.html"))`），但当前仓库树中并未包含 `src/` 渲染层文件（renderer），因此完整 UI/前端资源在该分支/提交中缺失或另存放于其他分支/子模块。

## 快速开始（开发）
先安装依赖：
```bash
npm install
```

开发（同时监听 Tailwind 并启动 Electron）：
```bash
npm run dev
# npm 脚本定义：
# "dev": "concurrently \"npm run dev:css\" \"npm run dev:app\""
# "dev:css": "tailwindcss -i ./src/styles/input.css -o ./src/styles/output.css --watch"
# "dev:app": "electron ."
```

构建并运行（会先构建 CSS）：
```bash
npm run build:css
npm start
# "build:css": "tailwindcss -i ./src/styles/input.css -o ./src/styles/output.css --minify"
# "start": "npm run build:css && electron ."
```

## 打包 macOS
构建 macOS 安装包（dmg、zip）：
```bash
npm run dist
# "dist": "npm run build:css && electron-builder --mac --x64"
```

仅在本地打包应用文件夹（不生成安装器）：
```bash
npm run pack
# "pack": "npm run build:css && electron-builder --dir --mac --x64"
```

electron-builder 的关键配置（来自 package.json）：
- appId: com.infinite-lofi.desktop
- productName: Infinite Lo‑Fi
- 输出目录: dist/
- mac 图标: assets/icon.icns
- mac 目标: dmg, zip

> 注意：在未使用 Apple Developer 证书的机器上打包的 macOS 应用将未签名，macOS 可能需要右键→打开来绕过 Gatekeeper。生产签名与 notarization 需要 Apple 开发者账号与相应证书/凭据。

## 已知/重要事项
- 仓库中含有主进程 (main.js) 与 preload.js、以及 assets 资产，但当前分支缺少 renderer（src/）文件；在缺失 renderer 的情况下，Electron 启动后无法加载完整 UI。
- 天气数据提供者在 README 中提到可能会出现 403 错误；具体的天气 API（若需要 key）由 renderer 层实现并管理——需要明确哪种提供者或是否内置缓存策略。
- music-metadata 用于读取嵌入封面；扫描本地音乐文件夹时会查找文件名相匹配的图片（cover.jpg/folder.jpg/front/album等）并尝试读取嵌入图片。
- Electron 版本在 package.json 中为 ^41.3.0，注意与本地 Node/Electron 运行环境兼容性（如果你遇到二进制或节点版本问题，请升级或使用 nvm 指定合适 Node 版本）。

## 常见问题（FAQ）
Q: 我运行 npm run dev 后窗口一片空白 / 找不到 index.html？
A: 请检查仓库是否包含 `src/index.html` 及 renderer 相关资源；当前分支并未包含 `src/`，需要把渲染层代码放入 `src/` 或切换到包含 renderer 的分支。

Q: 如何加载本地音乐？
A: 应用通过托盘或 UI 调用 `selectMusicFolder`（由 preload.js 暴露）选择本地目录，主进程会扫描音频文件并返回带封面信息的 track 列表。

Q: 我想在 CI 中打包并自动签名 mac 应用，需哪些准备？
A: 你需要 Apple Developer 账号、Developer ID Application 证书（和私钥）、并在构建机上配置证书或使用钥匙串；若要自动 notarize，还需将 API key/凭据配置到构建流程。是否需要我为你写一个 CI 示例（GitHub Actions）？

## 贡献
欢迎贡献。建议流程：
1. Fork 仓库 → 新分支（feature/xxx 或 fix/xxx）
2. 本地运行并验证（npm install → npm run dev / npm start）
3. 提交 PR，说明变更点与复现步骤

## 许可证
见 LICENSE 文件（仓库中已有 LICENSE）。

---

# English

## What this is
A minimal Electron-based desktop Pomodoro app with an ambient lo-fi music player (Infinite Lo‑Fi). Features include a focus/break timer, local notes, a music player with support for scanning local folders and extracting embedded artwork, background modes, a tray menu, and a simple stats dashboard.

## Key features
- Pomodoro-style focus/break timer with start/pause/reset and tray display
- Local notes with tabs and pinning
- Music player with bundled sample tracks and ability to load and scan a local music folder
- Background modes: black, white, wallpaper, image, video
- Tray icon with "minimize to tray" behavior
- Live clock, simple weather display, and focus stats panel
- macOS packaging configured via electron-builder (includes .icns icon)

## Stack
- Language: JavaScript
- Runtime / Framework: Electron (main process + renderer expected)
- Notable libraries: tailwindcss, electron-builder, music-metadata, concurrently

## Repository layout (important files)
See the Chinese section above for a full tree. Key runtime files:
- main.js — Electron main process (tray, IPC, music scanning, background handlers)
- preload.js — secure contextBridge API for renderer → main IPC
- package.json — scripts, dependencies, and build settings
- assets/ — icons and sample tracks

Note: main.js loads `src/index.html` but this repository snapshot does not include the renderer `src/` directory, so the UI files are missing from this branch.

## Quick start
Install dependencies:
```bash
npm install
```

Run in development (watch Tailwind + launch Electron):
```bash
npm run dev
```

Build and run (build CSS first):
```bash
npm run build:css
npm start
```

## macOS packaging
Build dmg/zip using electron-builder:
```bash
npm run dist
```

Local packaging (no installer):
```bash
npm run pack
```

## CI / Signing notes (GitHub Actions)
A sample GitHub Actions workflow is included at `.github/workflows/macos-build.yml` to build the macOS artifacts on macOS runners and upload the `dist/` output as an artifact.

For code signing and notarization, the workflow supports two approaches:
1. Using a P12 certificate (base64-encoded) stored in a repository secret (P12_BASE64) with its password (P12_PASSWORD). The workflow decodes the P12 and sets `CSC_LINK` and `CSC_KEY_PASSWORD` env vars so electron-builder can sign the app.
2. Using Apple API Key (recommended) — store the API key JSON as a base64 secret (APPLE_API_KEY_BASE64) and set APPLE_API_KEY_ID and APPLE_API_ISSUER_ID. The workflow decodes the API key file and sets environment variables needed for notarization.

You must add the required secrets in the repository settings before enabling automatic signing:
- P12_BASE64 — base64-encoded P12 (optional)
- P12_PASSWORD — password for P12 (optional)
- APPLE_API_KEY_BASE64 — base64-encoded Apple API key JSON (optional)
- APPLE_API_KEY_ID — API Key ID (if using API key)
- APPLE_API_ISSUER_ID — Issuer ID (if using API key)

If you want, I can help set up the workflow to only run on tagged releases and/or create a separate signing-only job that requires manual approval.

## Contributing
Same as in Chinese section — forks, PRs, tests.

---

If you'd like I will also:
- Add screenshots or a demo GIF into `assets/` and reference them from this README (you can upload images or give me links).
- Adjust CI workflow to run only on tags, or to also publish releases automatically.

