const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('source staging verifies every archive before including it in a release', async (t) => {
  const { stageSources } = await import('../scripts/stage-ffmpeg-sources.mjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-lofi-sources-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const content = Buffer.from('source fixture');
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const sourceArchives = [1, 2, 3].map((number) => ({
    file: `source-${number}.tar.gz`,
    url: `https://example.test/${number}`,
    sha256
  }));
  const fetchSource = async () => new Response(content);
  await stageSources({ sourceArchives }, directory, fetchSource);
  assert.deepEqual(await fs.readFile(path.join(directory, sourceArchives[0].file)), content);
  await assert.rejects(
    stageSources({ sourceArchives: [{ ...sourceArchives[0], sha256: '0'.repeat(64) }, ...sourceArchives.slice(1)] }, directory, fetchSource),
    /hash mismatch/
  );
  await assert.rejects(
    stageSources({ sourceArchives: [{ ...sourceArchives[0], file: '../escape' }, ...sourceArchives.slice(1)] }, directory, fetchSource),
    /metadata is invalid/
  );
});
