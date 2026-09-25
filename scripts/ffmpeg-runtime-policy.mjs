const REQUIRED_FLAGS = [
  '--disable-gpl',
  '--disable-nonfree',
  '--disable-version3',
  '--disable-autodetect',
  '--enable-libvpx',
  '--enable-libopus'
];
const ALLOWED_EXTERNAL_LIBRARIES = new Set(['libvpx', 'libopus']);

export function extractConfiguration(binary) {
  const marker = Buffer.from('--enable-libvpx');
  let offset = 0;
  while ((offset = binary.indexOf(marker, offset)) >= 0) {
    let start = offset;
    let end = offset;
    while (start > 0 && binary[start - 1] !== 0) start -= 1;
    while (end < binary.length && binary[end] !== 0) end += 1;
    const candidate = binary.toString('utf8', start, end).replace(/^%sconfiguration:\s*/, '');
    if (candidate.includes('--enable-libopus')) return candidate;
    offset += marker.length;
  }
  throw new Error('Embedded FFmpeg configuration is missing.');
}

export function assertSafeConfiguration(configuration) {
  const flags = new Set(configuration.match(/--[a-z0-9-]+(?:=[^\s]+)?/g) || []);
  for (const flag of REQUIRED_FLAGS) {
    if (!flags.has(flag)) throw new Error(`FFmpeg configuration lacks ${flag}.`);
  }
  for (const flag of ['--enable-gpl', '--enable-nonfree', '--enable-version3']) {
    if (flags.has(flag)) throw new Error(`FFmpeg configuration enables forbidden ${flag}.`);
  }
  for (const flag of flags) {
    if (!flag.startsWith('--enable-lib')) continue;
    const name = flag.slice('--enable-'.length).split('=')[0];
    if (!ALLOWED_EXTERNAL_LIBRARIES.has(name)) {
      throw new Error(`FFmpeg configuration enables unreviewed ${flag}.`);
    }
  }
}

export function assertRuntimeArchitecture(binary, platform, arch) {
  if (platform === 'darwin') {
    if (binary.readUInt32LE(0) !== 0xfeedfacf) throw new Error('FFmpeg is not a 64-bit Mach-O.');
    const cpu = binary.readUInt32LE(4);
    const expected = arch === 'x64' ? 0x01000007 : arch === 'arm64' ? 0x0100000c : null;
    if (cpu !== expected) throw new Error(`FFmpeg Mach-O architecture does not match ${arch}.`);
    return;
  }
  if (platform === 'win32' && arch === 'x64') {
    if (binary.toString('ascii', 0, 2) !== 'MZ') throw new Error('FFmpeg is not a PE executable.');
    const peOffset = binary.readUInt32LE(0x3c);
    if (binary.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0' || binary.readUInt16LE(peOffset + 4) !== 0x8664) {
      throw new Error('FFmpeg PE architecture is not x64.');
    }
    return;
  }
  throw new Error(`Unsupported FFmpeg runtime target: ${platform}-${arch}.`);
}
