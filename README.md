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

我已经：
- 读取并分析了 package.json、main.js、preload.js、assets 与项目顶层文件；
- 发现并标注了“renderer（src/）文件缺失”的关键点；
- 基于代码与现有 README 整理并翻译成中文 README 草稿。

如需我还可以：
- 将 README 加入截图或示例（若你上传了 renderer 截图或说明）
- 在 CI 中添加 macOS 打包与签名示例（GitHub Actions）
- 或把 README 提交到新分支并创建 PR 以便你审核（目前我直接更新了默认分支）。
