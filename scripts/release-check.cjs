const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runWorkspaceReleaseCheck(workspace) {
  return spawnSync(npmCommand, ["run", "release:check"], {
    cwd: resolve(repositoryRoot, workspace),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function runReleaseChecks(runWorkspace = runWorkspaceReleaseCheck) {
  for (const workspace of ["backend", "frontend"]) {
    console.log(`\n== ${workspace} release:check ==`);
    const result = runWorkspace(workspace);
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

if (require.main === module) {
  process.exit(runReleaseChecks());
}

module.exports = { runReleaseChecks };
