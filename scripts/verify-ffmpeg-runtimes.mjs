import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = path.join(projectDirectory, "vendor", "ffmpeg");
const manifest = JSON.parse(await fs.readFile(path.join(runtimeDirectory, "manifest.json"), "utf8"));
await fs.access(path.join(runtimeDirectory, "LICENSE.txt"));
const licenseText = await fs.readFile(path.join(runtimeDirectory, "LICENSE-GPL-3.0.txt"), "utf8");
if (!licenseText.includes("GNU GENERAL PUBLIC LICENSE")) throw new Error("Complete FFmpeg GPL text is missing.");
if (manifest.license !== "GPL-3.0-or-later" || !Array.isArray(manifest.runtimes)) {
  throw new Error("FFmpeg manifest or license metadata is invalid.");
}
for (const runtime of manifest.runtimes) {
  if (!/^[a-f0-9]{64}$/.test(runtime.sha256)) throw new Error(`FFmpeg hash is not pinned for ${runtime.platform}-${runtime.arch}.`);
  const filePath = path.join(runtimeDirectory, runtime.file);
  const hash = crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
  if (hash !== runtime.sha256) throw new Error(`FFmpeg checksum mismatch for ${runtime.platform}-${runtime.arch}.`);
}
console.log(`Verified ${manifest.runtimes.length} bundled FFmpeg runtimes and license metadata.`);
