import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const sources = ['main.js', 'preload.js'];

function collect(directory, extension, recursive = false) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const name = join(directory, entry.name);
    if (entry.isDirectory() && recursive) {
      collect(name, extension, true);
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      sources.push(name);
    }
  }
}

collect('scripts', '.mjs');
collect('src', '.js', true);
sources.sort();

for (const source of sources) {
  const result = spawnSync(process.execPath, ['--check', join(root, source)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(`Syntax check failed: ${source.replaceAll('\\', '/')}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`Syntax check passed: ${sources.length} JavaScript files\n`);
