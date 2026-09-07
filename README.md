# Infinite Lo‑Fi（中文 / English）

> 中文部分在上方，英文部分在下方（双语说明）。

[![CI](https://github.com/ginolyu3360-code/infinite-lofi/actions/workflows/ci.yml/badge.svg)](https://github.com/ginolyu3360-code/infinite-lofi/actions/workflows/ci.yml)

---

# Infinite Lo‑Fi（中文说明）

一个极简的桌面番茄钟 + 环境音乐播放器，基于 Electron 与 Tailwind CSS 构建。提供专注/休息计时、局部笔记、音乐播放（支持加载本地文件夹并提取嵌入封面）、背景模式、托盘交互与统计面板，适合想要低干扰背景音乐与简单专注工具的用户。

当前已发布版本：**v1.1.0**。`main` 分支的 **v1.2.0**（Phase 2，签名除外）已经阶段性完成，但尚未创建标签或 Release。安装包可从 [GitHub Releases](https://github.com/ginolyu3360-code/infinite-lofi/releases/latest) 下载；v1.2.0 起默认生成同时支持 Intel 与 Apple Silicon 的未签名 Universal 包。

继续开发前请先阅读 `HANDOFF.md`、`ROADMAP.md` 和 `verification-log.md`，并核对 Git 状态与最新 GitHub Actions。未经明确指令，不要创建 `v1.2.0` 标签或 Release。

## 主要特性
- 番茄专注 / 休息计时器，支持开始/暂停/重置与托盘显示
- 本地笔记（多标签、置顶）
- 音乐播放器：内置示例曲目 + 支持异步扫描已授权的本地音乐文件夹并缓存嵌入封面
- 版本化本地数据、旧数据自动迁移，以及完整备份导出/校验/恢复
- 背景模式：黑/白/壁纸/图片/视频
- 托盘图标与“最小化到托盘”行为
- 实时时钟、可关闭或指定城市的天气与简单统计面板
- 严格 CSP、Electron 沙箱和导航限制；生产包默认关闭 DevTools
- 离线本地字体，不再在运行时访问 Google Fonts
- Universal macOS 打包与基于版本标签的 GitHub Release 自动发布

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
HANDOFF.md             # 新会话接续说明、验证结果与下一步边界
.github/workflows/ci.yml # GitHub Actions 检查与 macOS 打包验证
.github/workflows/release.yml # 标签触发的 Universal Release 自动发布
scripts/smoke-ui.mjs    # Electron 界面冒烟测试
test/                   # 核心、存储与功能模型单元测试
src/
  ├─ index.html         # 应用界面
  ├─ renderer.js        # DOM 编排与交互逻辑
  ├─ core.js            # 可独立测试的纯逻辑
  ├─ security.js        # 主进程导航白名单逻辑
  ├─ storage.js         # 版本化存储、旧数据迁移与备份校验
  ├─ timer.js           # 计时器恢复状态模型
  ├─ notes.js           # 笔记排序与选择模型
  ├─ notes-controller.js # 笔记 DOM 与持久化控制器
  ├─ player.js          # 播放列表恢复模型
  ├─ player-controller.js # 播放器 DOM 与目录恢复控制器
  ├─ backgrounds.js     # 背景设置模型
  ├─ stats.js           # 统计范围与汇总模型
  ├─ stats-controller.js # 统计、备份与恢复控制器
  ├─ weather.js         # 天气文本规范化
  ├─ weather-controller.js # 时钟、天气网络与缓存控制器
  ├─ ui.js              # UI 设置规范化
  ├─ bindings.js        # 鼠标、表单、媒体与键盘事件绑定
  └─ styles/            # 本地字体、Tailwind、组件与生成样式
assets/                 # 内置资源：图标、示例音轨、托盘模板、背景等
  ├─ fonts/             # 本地 WOFF2 字体与 OFL 许可证
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
构建 Universal macOS 安装包（dmg、zip）：
```bash
npm run dist
# 默认同时包含 x86_64 与 arm64
```

仅在本地打包 Universal 应用文件夹（不生成安装器）：
```bash
npm run pack
# 默认生成 dist/mac-universal/Infinite Lo-Fi.app
```

electron-builder 的关键配置（来自 package.json）：
- appId: com.infinite-lofi.desktop
- productName: Infinite Lo‑Fi
- 输出目录: dist/
- mac 图标: assets/icon.icns
- mac 目标: dmg, zip
- 产物架构: Universal（x86_64 + arm64）

> 注意：在未使用 Apple Developer 证书的机器上打包的 macOS 应用将未签名，macOS 可能需要右键→打开来绕过 Gatekeeper。生产签名与 notarization 需要 Apple 开发者账号与相应证书/凭据。

## 已知/重要事项
- `src/` 渲染层源码已恢复，并通过开发版和打包版界面测试。
- Phase 1 已完成：应用会把旧版分散存储迁移到版本化状态；关闭行为、音乐目录/顺序和活动计时器可以恢复。
- Phase 2（签名除外）已完成：天气默认关闭，可选择自动 IP 定位或手动城市；设置面板会解释相应网络行为。
- 自动天气会把 IP 地址发送给 `ipapi.co`，再把坐标发送给 Open-Meteo；城市模式只向 Open-Meteo 发送城市名及坐标。关闭天气时不会发起天气或位置请求。
- 核心计时、笔记、本地音乐、背景和统计功能均可离线使用；字体已打包到应用内。
- 页面 CSP 只允许本地资源与已列明的天气接口；生产版禁用 DevTools 并阻止意外导航、新窗口和 webview。
- 统计面板中的 Backup 和 Restore 可导出、校验并恢复完整本地数据；恢复会替换当前本地数据。
- 如果版本化存储损坏或来自更高版本，应用会先保留原始值并显示恢复提示，而不是静默覆盖。
- 天气服务不可用时，应用会使用与当前模式/城市匹配的本地缓存，或显示明确的不可用状态。
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

Latest published release: **v1.1.0**. The **v1.2.0** Phase 2 scope (except signing) is staged on `main`, but no v1.2.0 tag or Release has been created. Download releases from [GitHub Releases](https://github.com/ginolyu3360-code/infinite-lofi/releases/latest). Starting with v1.2.0, the default unsigned artifacts are Universal macOS builds for Intel and Apple Silicon.

Before continuing in a new session, read `HANDOFF.md`, `ROADMAP.md`, and `verification-log.md`, then check Git status and the latest GitHub Actions run. Do not create the v1.2.0 tag or Release without an explicit instruction.

## Key features
- Pomodoro-style focus/break timer with start/pause/reset and tray display
- Local notes with tabs and pinning
- Music player with bundled sample tracks and ability to load and scan a local music folder
- Versioned local storage with legacy migration and validated backup restore
- Background modes: black, white, wallpaper, image, video
- Tray icon with "minimize to tray" behavior
- Live clock, opt-in automatic or city-based weather, and focus stats panel
- Restrictive CSP, renderer sandboxing, blocked navigation, and production DevTools disabled
- Locally bundled fonts for an offline main UI
- Universal macOS packaging and tag-driven GitHub Release automation

## Stack
- Language: JavaScript
- Runtime / Framework: Electron (main process, preload, and renderer)
- Notable libraries: tailwindcss, electron-builder, music-metadata, concurrently

## Repository layout (important files)
See the Chinese section above for a full tree. Key runtime files:
- main.js — Electron main process (tray, IPC, music scanning, background handlers)
- preload.js — secure contextBridge API for renderer → main IPC
- package.json — scripts, dependencies, and build settings
- src/ — renderer orchestration, independently testable feature models, and styles
- src/storage.js — versioned state, legacy migration, and backup validation
- Feature modules and controllers under src/ separate timer, notes, player, backgrounds, stats, weather, storage, and UI bindings
- scripts/smoke-ui.mjs — repeatable Electron UI smoke test
- test/ — unit tests for core logic, storage, and feature models
- assets/ — icons and sample tracks

The renderer source is included and has been verified in both development and packaged builds.

## Quick start
Install dependencies from the lockfile:
```bash
npm ci
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
Each launched smoke-test app now uses a fresh temporary profile, so the test cannot modify the normal application profile even if it fails midway.

Run both the checks and UI smoke test with:

```bash
npm run verify
```

## Build macOS App
Build the Universal macOS DMG, ZIP, and application bundle with:
```bash
npm run dist
```

Local packaging (no installer):
```bash
npm run pack
```

## CI / Signing notes (GitHub Actions)
The CI workflow installs locked dependencies, runs syntax and unit checks, exercises both the development and packaged applications with isolated UI smoke tests, builds the stylesheet, and verifies Universal macOS packaging. Pushing a matching `v*` tag runs the release workflow, which produces the Universal DMG/ZIP, generates SHA-256 checksums, and creates or updates the GitHub Release. Code signing and notarization are intentionally deferred.

Weather is off by default. Automatic mode sends the public IP address to `ipapi.co` and coordinates to Open-Meteo; city mode sends the city query and coordinates only to Open-Meteo. No weather/location requests are made while weather is off.

## Contributing
Same as in Chinese section — forks, PRs, tests.

See `ROADMAP.md` for the prioritized stabilization, security, distribution, and product plan.
