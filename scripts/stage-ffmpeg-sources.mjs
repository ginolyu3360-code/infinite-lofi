import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function stageSources(manifest, targetDirectory, fetchSource = fetch) {
  if (!Array.isArray(manifest?.sourceArchives) || manifest.sourceArchives.length !== 3) {
    throw new Error('FFmpeg corresponding source list is incomplete.');
  }
  await fs.mkdir(targetDirectory, { recursive: true });
  for (const source of manifest.sourceArchives) {
    if (!/^[A-Za-z0-9._-]+$/.test(source.file) || !/^[a-f0-9]{64}$/.test(source.sha256)) {
      throw new Error('FFmpeg source metadata is invalid.');
    }
    const response = await fetchSource(source.url);
    if (!response.ok) throw new Error(`Could not download ${source.file}: HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== source.sha256) throw new Error(`FFmpeg source hash mismatch: ${source.file}.`);
    await fs.writeFile(path.join(targetDirectory, source.file), bytes);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await fs.readFile(path.join(projectDirectory, 'vendor', 'ffmpeg', 'manifest.json'), 'utf8'));
  await stageSources(manifest, path.resolve(process.argv[2] ?? path.join(projectDirectory, 'dist')));
  process.stdout.write(`Staged ${manifest.sourceArchives.length} verified FFmpeg source archives.\n`);
}
