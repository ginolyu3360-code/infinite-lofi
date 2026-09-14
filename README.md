# Infinite Lo‑Fi（中文 / English）

> 中文部分在上方，英文部分在下方（双语说明）。

[![CI](https://github.com/ginolyu3360-code/infinite-lofi/actions/workflows/ci.yml/badge.svg)](https://github.com/ginolyu3360-code/infinite-lofi/actions/workflows/ci.yml)

---

# Infinite Lo‑Fi（中文说明）

一个极简的桌面番茄钟 + 环境音乐播放器，基于 Electron 与 Tailwind CSS 构建。提供专注/休息计时、局部笔记、音乐播放（支持加载本地文件夹并提取嵌入封面）、背景模式、托盘交互与统计面板，适合想要低干扰背景音乐与简单专注工具的用户。

当前发布版本：**v1.4.0**。安装包可从 [GitHub Releases](https://github.com/ginolyu3360-code/infinite-lofi/releases/latest) 下载；默认提供同时支持 Intel 与 Apple Silicon 的未签名 Universal 包。本版本包含完整的 Phase 4，以及快捷键面板中的七语言即时切换。

当前源码还包含尚未发布的反馈改进：大曲库 Queue 管理、单曲循环/随机播放、Mini 播放控制、更大的响应式计时器，以及多项交互修复。源码版本号仍为 1.4.0，这些改进不应被误认为已经进入 v1.4.0 Release。

继续开发前请先阅读 `HANDOFF.md`、`ROADMAP.md` 和 `verification-log.md`，并核对 Git 状态与最新 GitHub Actions。后续版本仍须在得到明确发布指令后创建标签和 Release。

## 主要特性
- 番茄专注 / 短休息 / 长休息计时器，支持可配置循环、独立自动开始选项、每日目标、开始/暂停/重置与托盘显示
- 可选的 Focus Intent：最多保存 100 个短标题任务，选择下一轮意图，并以冻结快照记录本轮与历史归属
- Focus Review：按今天、最近 7 天和最近 30 天，以稳定任务身份解释账本中的专注时间
- 三种原创 MIT 离线环境音，可在音乐旁独立播放一种，并可选择启用有界、可取消的音频淡入淡出
- Quiet Studio 响应式界面，以及带上一首/下一首与播放进度的 Mini Mode；计时器按可用窗口空间动态放大
- 本地笔记（多标签、置顶）
- 音乐播放器：内置示例曲目、本地文件夹异步扫描、可滚动/全量 Queue 管理、拖拽或点选换位、单曲循环与非重复周期随机播放
- 系统原生媒体信息与播放控制：播放/暂停、上一首、下一首、停止、快进、快退和定位
- 版本化本地数据、旧数据自动迁移，以及完整备份导出/校验/恢复
- 4 个内置场景预设：Quiet Studio、Midnight、Moss 与 Paper；另支持壁纸、图片、视频和曲目封面
- 系统原生窗口按钮、标准 macOS 关闭/退出行为与托盘菜单
- 顶栏快捷键入口，也可按 `Shift + /`（即 `?`）打开快捷键面板
- 快捷键面板内可即时切换简体中文、繁體中文、English、日本語、Français、한국어 与 Español；选择会随完整备份保存
- 面板与响应式 Notes 的焦点进入、Tab 圈定、Escape 关闭和焦点返回，以及计时器、播放器与历史操作的读屏播报
- 所有内置场景的核心文字通过 WCAG AA 对比度检查，并遵循系统“减少动态效果”设置
- 实时时钟、可关闭或指定城市的天气，以及支持逐次记录编辑与有限趋势的统计面板
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
infinite_lofi.code-workspace
main.js                 # Electron 主进程入口，托盘、IPC、音乐扫描等逻辑都在这里
preload.js              # contextBridge：主进程与 renderer 的安全桥
package.json            # 脚本、依赖、打包配置
tailwind.config.js
verification-log.md
HANDOFF.md             # 新会话接续说明、验证结果与下一步边界
UI-REFRESH-PLAN.md     # Phase 3 前 UI 基础改版的决策、规则与验收标准
.github/workflows/ci.yml # GitHub Actions 检查与 macOS 打包验证
.github/workflows/release.yml # 标签触发的 Universal Release 自动发布
scripts/smoke-ui.mjs    # Electron 界面冒烟测试
test/                   # 核心、存储与功能模型单元测试
src/
  ├─ index.html         # 应用界面
  ├─ renderer.js        # DOM 编排与交互逻辑
  ├─ core.js            # 可独立测试的纯逻辑
  ├─ i18n.js            # 七语言词典、语言规范化与界面翻译
  ├─ security.js        # 主进程导航白名单逻辑
  ├─ storage.js         # 版本化存储、旧数据迁移与备份校验
  ├─ timer.js           # 计时器恢复状态模型
  ├─ tasks.js           # 任务、选择、排序与分页模型
  ├─ tasks-controller.js # Tasks 抽屉与意图交互控制器
  ├─ focus-session.js   # 完成记账与下一计时状态的原子提交
  ├─ notes.js           # 笔记排序与选择模型
  ├─ notes-controller.js # 笔记 DOM 与持久化控制器
  ├─ player.js          # 播放列表恢复模型
  ├─ media-session.js   # 系统媒体信息、播放键与定位控制
  ├─ player-controller.js # 播放器 DOM 与目录恢复控制器
  ├─ backgrounds.js     # 背景设置模型
  ├─ stats.js           # 统计范围与汇总模型
  ├─ stats-controller.js # 统计、备份与恢复控制器
  ├─ weather.js         # 天气文本规范化
  ├─ weather-controller.js # 时钟、天气网络与缓存控制器
  ├─ ui.js              # UI 设置规范化
  ├─ accessibility.js   # 焦点管理、读屏播报与对比度计算
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
- Phase 1 已完成：应用会把旧版分散存储迁移到版本化状态；音乐目录/顺序和活动计时器可以恢复。
- Phase 2（签名除外）已完成：天气默认关闭，可选择自动 IP 定位或手动城市；设置面板会解释相应网络行为。
- Phase 3A Focus Plan 已完成：可配置长休息与循环、独立自动开始选项和每日专注目标。
- Phase 3B Session History 已完成：逐次专注记录可新增、修改和删除，并提供活跃天数、当前连续天数和相对上一周期变化；schema v3 会把旧的每日汇总安全迁移成可编辑条目。
- Phase 3C Playlist & Media Controls 已完成：schema v4 使用文件夹内相对文件名保存稳定队列，移动文件夹后可重连，缺失曲目不会静默消失，并接入系统媒体信息与播放键。
- Phase 3D Accessibility 已完成：弹层与响应式 Notes/Queue 具备可预测的键盘焦点，重要状态会经实时区域播报，核心深浅主题文字有 AA 对比度回归检查，减少动态效果也有真实 Electron 验证。
- Phase 3E Curated Scenes 已完成：新增 Quiet Studio、Midnight、Moss 与 Paper，旧的黑/白/自定义媒体设置会自动映射，保存的本地图片和视频路径不会因切换预设而删除。
- Phase 4A Focus Intent 已完成于源码：schema v5 保存标题任务、下一轮选择和当前轮冻结快照；完成记账与下一计时状态原子写入，任务改名、完成或删除不会重写进行中或历史快照。
- Phase 4B Focus Review 已完成于源码：Stats 明确使用今天、最近 7 天和最近 30 天滚动范围，按稳定任务 ID 汇总账本时间，并分别标识已删除任务、仅快照与未指定记录；界面同时解释零基线、取整、导入数据及保留边界。
- Phase 4C1 Ambient Layer 已完成于源码：Scene 提供三种原创 MIT 离线环境音，可与音乐独立控制且同一时间最多播放一种；选择与独立音量保存在 schema v5，但启动、恢复和异常恢复后始终暂停。
- Phase 4C2 Audio Transitions 已完成于源码：Scene 可选择启用最长 3000 ms 的音乐与环境声淡入淡出；默认仍为 200 ms，用户音量与瞬时增益分离，连续操作只服从最后意图，切换音源不重叠，系统停止立即静音两条通道。
- 快捷键面板提供七种显示语言。切换会立即更新主要界面、动态状态、日期/天气、无障碍文本和托盘菜单；语言偏好保存在 schema v5 的 `settings.ui.language`，不改变版本号或任务/计时语义。
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
A: 在 Queue 中选择 **Load Folder**，然后选择本地音乐目录。应用会保存已授权目录及 Queue 顺序；目录内容变化后可选择 **Rescan**。

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

Current release: **v1.4.0**. Download it from [GitHub Releases](https://github.com/ginolyu3360-code/infinite-lofi/releases/latest). The default unsigned artifacts are Universal macOS builds for Intel and Apple Silicon. This release contains the complete Phase 4 plus immediate seven-language switching in Keys.

The current source also contains unreleased feedback work: large-library Queue management, Repeat One and Shuffle, Mini transport controls, a larger responsive timer, and interaction fixes. The package version remains 1.4.0, so these changes must not be described as part of the published v1.4.0 Release.

Before continuing in a new session, read `HANDOFF.md`, `ROADMAP.md`, and `verification-log.md`, then check Git status and the latest GitHub Actions run. Future tags and Releases still require an explicit release instruction.

## Key features
- Pomodoro-style focus, short-break, and long-break timer with configurable cycles, independent auto-start options, an optional daily goal, start/pause/reset, and tray display
- Optional Focus Intent with up to 100 short-title tasks, a next-session choice, and immutable current/history attribution snapshots
- Exact-second Focus Review summaries for Today, the last 7 days, and the last 30 days, grouped by stable task identity
- Responsive Quiet Studio interface with a dynamically sized timer and a Mini Mode that includes previous/next and playback progress
- Local notes with tabs and pinning
- Music player with bundled tracks, local-folder recovery, scrollable/full Queue management, drag or click-to-swap ordering, Repeat One, and non-repeating-cycle Shuffle
- Native Media Session metadata, playback, track navigation, stop, and seeking controls
- Three original bundled offline ambient loops with a single independent playback layer and volume
- Optional bounded, cancellable audio fades up to 3000 ms for playback and sequential source changes
- Versioned local storage with legacy migration and validated backup restore
- Four built-in scene presets—Quiet Studio, Midnight, Moss, and Paper—plus wallpaper, image, video, and track-cover sources
- Native OS window controls, standard macOS close/quit behavior, and a tray menu
- Visible keyboard-shortcut entry point; `Shift + /` (`?`) also opens the shortcut panel
- Immediate display-language switching in the shortcut panel for Simplified Chinese, Traditional Chinese, English, Japanese, French, Korean, and Spanish, persisted in full backups
- Predictable dialog, responsive Notes, and Queue focus behavior with live screen-reader announcements
- WCAG AA checks for core text colors across every built-in scene and verified reduced-motion behavior
- Live clock, opt-in automatic or city-based weather, and a focus stats panel with editable session history and bounded trends
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
- Feature modules and controllers under src/ separate timer, tasks, atomic focus-session persistence, notes, player, backgrounds, stats, weather, storage, and UI bindings
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

The smoke test exercises Focus Intent, timer attribution and recovery, Focus Plan, notes, player, statistics, scenes, accessibility, responsive/Mini layouts, and the maximum retained task/history fixture. It restores the previous local storage after the run.
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
