const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('syntax check discovers new nested files and rejects invalid JavaScript', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'infinite-lofi-syntax-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true });
  for (const name of ['main.js', 'preload.js', 'scripts/new.mjs', 'src/nested/new.js']) {
    fs.writeFileSync(path.join(root, name), 'const valid = true;\n');
  }

  const script = path.join(__dirname, '..', 'scripts', 'check-syntax.mjs');
  const run = () => spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /4 JavaScript files/);

  fs.writeFileSync(path.join(root, 'src', 'nested', 'new.js'), 'const invalid = ;\n');
  const invalid = run();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /src\/nested\/new\.js/);
});
