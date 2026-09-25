import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRuntimeArchitecture, assertSafeConfiguration, extractConfiguration } from "./ffmpeg-runtime-policy.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = path.join(projectDirectory, "vendor", "ffmpeg");
const manifest = JSON.parse(await fs.readFile(path.join(runtimeDirectory, "manifest.json"), "utf8"));
for (const [name, marker] of [
  ["LICENSE.txt", "FFmpeg"],
  ["LICENSE-LGPL-2.1.txt", "GNU LESSER GENERAL PUBLIC LICENSE"],
  ["LICENSE-LIBVPX.txt", "Redistribution and use"],
  ["LICENSE-OPUS.txt", "Redistribution and use"],
  ["SOURCE.txt", "Corresponding sources"]
]) {
  const contents = await fs.readFile(path.join(runtimeDirectory, name), "utf8");
  if (!contents.includes(marker)) throw new Error(`FFmpeg notice is incomplete: ${name}.`);
}
if (manifest.license !== "LGPL-2.1-or-later" || !Array.isArray(manifest.runtimes) || manifest.runtimes.length !== 3) {
  throw new Error("FFmpeg manifest or license metadata is invalid.");
}
if (!Array.isArray(manifest.sourceArchives) || manifest.sourceArchives.length !== 3) {
  throw new Error("FFmpeg corresponding source list is incomplete.");
}
const sourceNotice = await fs.readFile(path.join(runtimeDirectory, "SOURCE.txt"), "utf8");
for (const source of manifest.sourceArchives) {
  if (!/^https:\/\//.test(source.url) || !/^[A-Za-z0-9._-]+$/.test(source.file) || !/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw new Error(`FFmpeg source metadata is invalid: ${source.name}.`);
  }
  if (!sourceNotice.includes(source.url) || !sourceNotice.includes(source.sha256)) {
    throw new Error(`FFmpeg source notice does not match manifest: ${source.name}.`);
  }
}
const expectedTargets = new Set(["darwin-x64", "darwin-arm64", "win32-x64"]);
for (const runtime of manifest.runtimes) {
  const target = `${runtime.platform}-${runtime.arch}`;
  if (!expectedTargets.delete(target)) throw new Error(`Unexpected or duplicate FFmpeg target: ${target}.`);
  if (!/^[a-f0-9]{64}$/.test(runtime.sha256)) throw new Error(`FFmpeg hash is not pinned for ${runtime.platform}-${runtime.arch}.`);
  const filePath = path.join(runtimeDirectory, runtime.file);
  const binary = await fs.readFile(filePath);
  const hash = crypto.createHash("sha256").update(binary).digest("hex");
  if (hash !== runtime.sha256) throw new Error(`FFmpeg checksum mismatch for ${runtime.platform}-${runtime.arch}.`);
  assertRuntimeArchitecture(binary, runtime.platform, runtime.arch);
  assertSafeConfiguration(extractConfiguration(binary));
}
if (expectedTargets.size > 0) throw new Error(`Missing FFmpeg targets: ${[...expectedTargets].join(", ")}.`);
console.log(`Verified ${manifest.runtimes.length} bundled FFmpeg runtimes, configurations, and source/license metadata.`);
