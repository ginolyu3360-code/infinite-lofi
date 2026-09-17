import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const nativeSourceDirectory = path.join(projectRoot, "native");
const outputDirectory = path.join(projectRoot, "native-bin");
const developmentDirectory = path.join(projectRoot, ".native-cache", "node-gyp");
const finalBinary = path.join(outputDirectory, "macos_media_bridge.node");
const requestedTarget = process.argv[2] || "current";

if (process.platform !== "darwin") {
  console.log("Skipping the macOS native media bridge on this platform.");
  process.exit(0);
}

const electronVersion = require("electron/package.json").version;
const nodeGyp = path.join(projectRoot, "node_modules", "node-gyp", "bin", "node-gyp.js");
const architectures = requestedTarget === "universal"
  ? ["x64", "arm64"]
  : [requestedTarget === "current" ? process.arch : requestedTarget];

if (architectures.some((architecture) => !["x64", "arm64"].includes(architecture))) {
  throw new Error(`Unsupported macOS media bridge architecture: ${requestedTarget}`);
}

mkdirSync(outputDirectory, { recursive: true });
const architectureBinaries = [];
for (const architecture of architectures) {
  const result = spawnSync(process.execPath, [
    nodeGyp,
    "rebuild",
    `--target=${electronVersion}`,
    "--runtime=electron",
    `--arch=${architecture}`,
    `--devdir=${developmentDirectory}`,
    "--dist-url=https://electronjs.org/headers"
  ], {
    cwd: nativeSourceDirectory,
    env: { ...process.env, npm_config_arch: architecture },
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
  const architectureBinary = path.join(outputDirectory, `macos_media_bridge-${architecture}.node`);
  copyFileSync(path.join(nativeSourceDirectory, "build", "Release", "macos_media_bridge.node"), architectureBinary);
  architectureBinaries.push(architectureBinary);
}

if (architectureBinaries.length === 1) {
  copyFileSync(architectureBinaries[0], finalBinary);
} else {
  const result = spawnSync("lipo", ["-create", ...architectureBinaries, "-output", finalBinary], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const architectureBinary of architectureBinaries) rmSync(architectureBinary, { force: true });
console.log(`Built macOS native media bridge: ${finalBinary}`);
