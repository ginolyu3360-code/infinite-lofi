const test = require("node:test");
const assert = require("node:assert/strict");
const packageJson = require("../package.json");

test("distribution scripts disable electron-builder implicit publishing", () => {
  for (const scriptName of ["dist:x64", "dist:arm64", "dist:universal"]) {
    assert.match(
      packageJson.scripts[scriptName],
      /electron-builder\b.*--publish never\b/,
      `${scriptName} must leave Release publication to the GitHub workflow`
    );
  }
});
