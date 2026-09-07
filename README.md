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
- 语言：JavaScript（Electron 主进程、preload 与 renderer）
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
ROADMAP.md
inifinite_lofi.code-workspace
main.js                 # Electron 主进程入口，托盘、IPC、音乐扫描等逻辑都在这里
preload.js              # contextBridge：主进程与 renderer 的安全桥
package.json            # 脚本、依赖、打包配置
tailwind.config.js
verification-log.md
.github/workflows/ci.yml # GitHub Actions 检查与 macOS 打包验证
scripts/smoke-ui.mjs    # Electron 界面冒烟测试
test/core.test.js       # 核心逻辑单元测试
src/
  ├─ index.html         # 应用界面
  ├─ renderer.js        # 功能与交互逻辑
  ├─ core.js            # 可独立测试的纯逻辑
  └─ styles/            # Tailwind 输入与生成样式
assets/                 # 内置资源：图标、示例音轨、托盘模板、背景等
  ├─ icon.icns
  ├─ icon.png
  ├─ trayTemplate.png
  ├─ background.jpg
  ├─ track-01.wav
  ├─ track-02.wav
  └─ track-03.wav
```

## 快速开始（开发）
按锁文件安装依赖：
```bash
npm ci
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
- `src/` 渲染层源码已恢复，并通过开发版和打包版界面测试。
- 天气服务可能出现 403 或网络错误；应用会尝试备用提供者并使用本地缓存。
- music-metadata 用于读取嵌入封面；扫描本地音乐文件夹时会查找文件名相匹配的图片（cover.jpg/folder.jpg/front/album等）并尝试读取嵌入图片。
- Electron 版本在 package.json 中为 ^41.3.0，注意与本地 Node/Electron 运行环境兼容性（如果你遇到二进制或节点版本问题，请升级或使用 nvm 指定合适 Node 版本）。

## 常见问题（FAQ）
Q: 我运行 npm run dev 后窗口一片空白怎么办？
A: 先运行 `npm ci` 和 `npm run check`；确认通过后再运行 `npm start`，并查看终端中的 Electron 错误信息。

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
- Runtime / Framework: Electron (main process, preload, and renderer)
- Notable libraries: tailwindcss, electron-builder, music-metadata, concurrently

## Repository layout (important files)
See the Chinese section above for a full tree. Key runtime files:
- main.js — Electron main process (tray, IPC, music scanning, background handlers)
- preload.js — secure contextBridge API for renderer → main IPC
- package.json — scripts, dependencies, and build settings
- src/ — complete renderer UI, core helpers, and styles
- scripts/smoke-ui.mjs — repeatable Electron UI smoke test
- test/core.test.js — core unit tests
- assets/ — icons and sample tracks

The renderer source is included and has been verified in both development and packaged builds.

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

For a reproducible install from the lockfile, prefer `npm ci`.

## Verify

Run syntax checks, unit tests, and the stylesheet build with:

```bash
npm run check
```

Run the automated Electron UI smoke test with:

```bash
npm run smoke
```

The smoke test exercises the timer, notes, player, statistics drawer, and background drawer. It restores the previous local storage after the run.

Run both the checks and UI smoke test with:

```bash
npm run verify
```

## Build macOS App
Build the macOS DMG, ZIP, and application bundle with:
```bash
npm run dist
```

Local packaging (no installer):
```bash
npm run pack
```

## CI / Signing notes (GitHub Actions)
The workflow at `.github/workflows/ci.yml` installs locked dependencies, runs syntax and unit checks, builds the stylesheet, and verifies macOS packaging. Code signing and notarization are intentionally not enabled because they require private Apple Developer credentials.

## Contributing
Same as in Chinese section — forks, PRs, tests.

See `ROADMAP.md` for the prioritized stabilization, security, distribution, and product plan.
