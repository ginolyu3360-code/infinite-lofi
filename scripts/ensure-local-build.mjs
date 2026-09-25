import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectDirectory, 'dist');
const markerPath = path.join(outputDirectory, '.local-build.json');

export function localBuildTarget(platform, projectRoot) {
  if (platform === 'darwin') {
    const app = path.join(projectRoot, 'dist', 'mac-universal', 'Infinite Lo-Fi.app', 'Contents');
    return {
      command: 'pack:universal',
      executable: path.join(app, 'MacOS', 'Infinite Lo-Fi'),
      requiredFiles: [
        path.join(app, 'MacOS', 'Infinite Lo-Fi'),
        path.join(app, 'Resources', 'app.asar'),
        path.join(app, 'Resources', 'ffmpeg', 'darwin-x64', 'ffmpeg'),
        path.join(app, 'Resources', 'ffmpeg', 'darwin-arm64', 'ffmpeg')
      ]
    };
  }
  if (platform === 'win32') {
    const app = path.join(projectRoot, 'dist', 'win-unpacked');
    return {
      command: 'pack:win',
      executable: path.join(app, 'Infinite Lo-Fi.exe'),
      requiredFiles: [
        path.join(app, 'Infinite Lo-Fi.exe'),
        path.join(app, 'resources', 'app.asar'),
        path.join(app, 'resources', 'ffmpeg', 'win32-x64', 'ffmpeg.exe')
      ]
    };
  }
  throw new Error(`Local packaged builds are unsupported on ${platform}.`);
}

export function isLocalBuildCurrent(marker, { tree, platform, version, dirty, outputsPresent }) {
  return !dirty && outputsPresent && marker?.tree === tree &&
    marker?.platform === platform && marker?.version === version;
}

async function run() {
  const target = localBuildTarget(process.platform, projectDirectory);
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: projectDirectory, encoding: 'utf8' }).trim();
  const dirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: projectDirectory,
    encoding: 'utf8'
  }).trim());
  const { version } = JSON.parse(await fs.readFile(path.join(projectDirectory, 'package.json'), 'utf8'));
  const marker = await fs.readFile(markerPath, 'utf8').then(
    (contents) => {
      try { return JSON.parse(contents); } catch { return null; }
    },
    () => null
  );
  const outputsPresent = (await Promise.all(target.requiredFiles.map((file) => fs.stat(file).then(
    (stat) => stat.isFile(),
    () => false
  )))).every(Boolean);

  if (!isLocalBuildCurrent(marker, { tree, platform: process.platform, version, dirty, outputsPresent })) {
    process.stdout.write('Updating the local packaged app from the current source...\n');
    const result = spawnSync('npm', ['run', target.command], {
      cwd: projectDirectory,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Local build failed with exit code ${result.status}.`);
    for (const file of target.requiredFiles) await fs.access(file);
    await fs.mkdir(outputDirectory, { recursive: true });
    const temporaryMarker = `${markerPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryMarker, JSON.stringify({ tree, platform: process.platform, version }, null, 2));
    await fs.rename(temporaryMarker, markerPath);
  } else {
    process.stdout.write('Local packaged app is current.\n');
  }

  if (process.argv.includes('--launch')) {
    const child = spawn(target.executable, [], { cwd: projectDirectory, stdio: 'inherit' });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
