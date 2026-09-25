const test = require('node:test');
const assert = require('node:assert/strict');

const SAFE = '--disable-gpl --disable-nonfree --disable-version3 --disable-autodetect --enable-libvpx --enable-libopus';

test('FFmpeg policy accepts only the reviewed VP8/Opus dependency set', async () => {
  const { assertSafeConfiguration } = await import('../scripts/ffmpeg-runtime-policy.mjs');
  assert.doesNotThrow(() => assertSafeConfiguration(SAFE));
  assert.throws(() => assertSafeConfiguration(SAFE.replace('--disable-nonfree', '--enable-nonfree')), /nonfree/);
  assert.throws(() => assertSafeConfiguration(`${SAFE} --enable-libx264`), /libx264/);
  assert.throws(() => assertSafeConfiguration(SAFE.replace('--enable-libopus', '')), /libopus/);
});

test('FFmpeg policy extracts the actual embedded configure flags', async () => {
  const { extractConfiguration, assertSafeConfiguration } = await import('../scripts/ffmpeg-runtime-policy.mjs');
  const image = Buffer.from(`unrelated\0%sconfiguration: ${SAFE}\0`);
  assert.equal(extractConfiguration(image), SAFE);
  assert.doesNotThrow(() => assertSafeConfiguration(extractConfiguration(image)));
  assert.throws(() => extractConfiguration(Buffer.from('no configuration')), /missing/);
});

test('FFmpeg policy rejects mismatched Mach-O and PE architectures', async () => {
  const { assertRuntimeArchitecture } = await import('../scripts/ffmpeg-runtime-policy.mjs');
  const macho = Buffer.alloc(16);
  macho.writeUInt32LE(0xfeedfacf, 0);
  macho.writeUInt32LE(0x01000007, 4);
  assert.doesNotThrow(() => assertRuntimeArchitecture(macho, 'darwin', 'x64'));
  assert.throws(() => assertRuntimeArchitecture(macho, 'darwin', 'arm64'), /architecture/);
  const pe = Buffer.alloc(128);
  pe.write('MZ', 0, 'ascii');
  pe.writeUInt32LE(64, 0x3c);
  pe.write('PE\0\0', 64, 'ascii');
  pe.writeUInt16LE(0x8664, 68);
  assert.doesNotThrow(() => assertRuntimeArchitecture(pe, 'win32', 'x64'));
  pe.writeUInt16LE(0x014c, 68);
  assert.throws(() => assertRuntimeArchitecture(pe, 'win32', 'x64'), /architecture/);
});
