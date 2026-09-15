const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("development and packaged smoke runs use an app-level isolated profile", () => {
  const projectRoot = path.join(__dirname, "..");
  const mainSource = fs.readFileSync(path.join(projectRoot, "main.js"), "utf8");
  const smokeSource = fs.readFileSync(path.join(projectRoot, "scripts", "smoke-ui.mjs"), "utf8");

  assert.match(smokeSource, /INFINITE_LOFI_SMOKE_PROFILE:\s*smokeUserDataDirectory/);
  assert.match(mainSource, /process\.env\.INFINITE_LOFI_SMOKE_PROFILE/);
  assert.match(mainSource, /app\.setPath\("userData",\s*testUserDataDirectory\)/);
  assert.match(mainSource, /app\.setPath\("sessionData",\s*testUserDataDirectory\)/);
});
