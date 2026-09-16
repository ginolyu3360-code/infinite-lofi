const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const packageJson = require("../package.json");

const projectDirectory = path.resolve(__dirname, "..");

test("distribution scripts disable electron-builder implicit publishing", () => {
  for (const scriptName of ["dist:x64", "dist:arm64", "dist:universal", "dist:win"]) {
    assert.match(
      packageJson.scripts[scriptName],
      /electron-builder\b.*--publish never\b/,
      `${scriptName} must leave Release publication to the GitHub workflow`
    );
  }
});

test("development and packaged smoke runs use an app-level isolated profile", () => {
  const mainSource = fs.readFileSync(path.join(projectDirectory, "main.js"), "utf8");
  const smokeSource = fs.readFileSync(path.join(projectDirectory, "scripts", "smoke-ui.mjs"), "utf8");

  assert.match(smokeSource, /INFINITE_LOFI_SMOKE_PROFILE:\s*smokeUserDataDirectory/);
  assert.match(mainSource, /process\.env\.INFINITE_LOFI_SMOKE_PROFILE/);
  assert.match(mainSource, /app\.setPath\("userData",\s*testUserDataDirectory\)/);
  assert.match(mainSource, /app\.setPath\("sessionData",\s*testUserDataDirectory\)/);
  assert.match(smokeSource, /await stopApp\(\);\s*removeSmokeProfile\(\);/);
  assert.match(smokeSource, /maxRetries:\s*20,\s*retryDelay:\s*100/);
});

test("development smoke bypasses the Unix npm shim on Windows", () => {
  const smokeSource = fs.readFileSync(path.join(projectDirectory, "scripts", "smoke-ui.mjs"), "utf8");

  assert.match(smokeSource, /createRequire\(import\.meta\.url\)/);
  assert.match(smokeSource, /process\.platform === "win32"\s*\? require\("electron"\)/);
  assert.match(smokeSource, /:\s*path\.join\(projectDirectory, "node_modules", "\.bin", "electron"\)/);
});

test("native window frames do not reduce the tested or supported content viewport", () => {
  const mainSource = fs.readFileSync(path.join(projectDirectory, "main.js"), "utf8");
  const smokeSource = fs.readFileSync(path.join(projectDirectory, "scripts", "smoke-ui.mjs"), "utf8");

  assert.match(mainSource, /function setMinimumContentSize[\s\S]*getContentSize\(\)[\s\S]*setMinimumSize\(/);
  assert.match(mainSource, /\? \[360, 200\]/);
  assert.match(mainSource, /:\s*\[720, 520\]/);
  assert.match(mainSource, /queuePanelOpen[\s\S]*\[900, 780\]/);
  assert.match(mainSource, /ipcMain\.handle\("window:setQueueOpen"/);
  assert.match(smokeSource, /queueResizeConstraintResult/);
  assert.match(smokeSource, /window\.outerWidth - window\.innerWidth/);
  assert.match(smokeSource, /window\.outerHeight - window\.innerHeight/);
});

test("Windows distribution is an x64 assisted NSIS installer", () => {
  assert.equal(packageJson.scripts.dist, "npm run dist:mac");
  assert.match(packageJson.scripts["dist:win"], /electron-builder\b.*--win nsis\b.*--x64\b/);
  assert.match(packageJson.scripts["pack:win"], /electron-builder\b.*--dir\b.*--win\b.*--x64\b/);
  assert.match(packageJson.scripts["smoke:packaged:win"], /dist\/win-unpacked\/Infinite Lo-Fi\.exe/);
  assert.deepEqual(packageJson.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(packageJson.build.win.icon, "assets/icon.png");
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.perMachine, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false);
});

test("CI and tagged release drafts verify both platforms before publication", () => {
  const ciWorkflow = fs.readFileSync(path.join(projectDirectory, ".github", "workflows", "ci.yml"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(projectDirectory, ".github", "workflows", "release.yml"), "utf8");

  assert.match(ciWorkflow, /os: windows-latest/);
  assert.match(ciWorkflow, /smoke_command: npm run smoke:packaged:win/);
  assert.match(releaseWorkflow, /run: npm run dist:win/);
  assert.match(releaseWorkflow, /run: npm run smoke:packaged:mac/);
  assert.match(releaseWorkflow, /run: npm run smoke:packaged:win/);
  assert.match(releaseWorkflow, /path: dist\/\*\.exe/);
  assert.match(releaseWorkflow, /dist\/\*\.exe dist\/SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /--json isDraft --jq \.isDraft/);
  assert.match(releaseWorkflow, /gh release create[\s\S]*--draft/);
});
