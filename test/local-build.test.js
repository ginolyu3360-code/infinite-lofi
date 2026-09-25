const test = require('node:test');
const assert = require('node:assert/strict');

test('local packaged build target includes both FFmpeg architectures on macOS', async () => {
  const { localBuildTarget } = await import('../scripts/ensure-local-build.mjs');
  const target = localBuildTarget('darwin', '/project');
  assert.equal(target.command, 'pack:universal');
  assert.equal(target.requiredFiles.length, 4);
  assert.ok(target.requiredFiles.some((file) => file.includes('darwin-x64')));
  assert.ok(target.requiredFiles.some((file) => file.includes('darwin-arm64')));
  assert.equal(localBuildTarget('win32', '/project').command, 'pack:win');
  assert.throws(() => localBuildTarget('linux', '/project'), /unsupported/);
});

test('local build freshness changes with the source tree, version, files, or edits', async () => {
  const { isLocalBuildCurrent } = await import('../scripts/ensure-local-build.mjs');
  const state = { tree: 'abc', platform: 'darwin', version: '1.5.3', dirty: false, outputsPresent: true };
  const marker = { tree: 'abc', platform: 'darwin', version: '1.5.3' };
  assert.equal(isLocalBuildCurrent(marker, state), true);
  assert.equal(isLocalBuildCurrent(marker, { ...state, tree: 'def' }), false);
  assert.equal(isLocalBuildCurrent(marker, { ...state, dirty: true }), false);
  assert.equal(isLocalBuildCurrent(marker, { ...state, outputsPresent: false }), false);
  assert.equal(isLocalBuildCurrent(marker, { ...state, version: '1.5.4' }), false);
});
