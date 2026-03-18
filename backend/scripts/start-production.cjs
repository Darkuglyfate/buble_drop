#!/usr/bin/env node
/**
 * Production entry: runs TypeORM migrations against dist, then starts Nest.
 * Set RUN_MIGRATIONS_ON_START=0 to skip (e.g. debugging).
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const skipMigrate =
  process.env.RUN_MIGRATIONS_ON_START === "0" ||
  process.env.RUN_MIGRATIONS_ON_START === "false";

function runMigrations() {
  const ds = path.join(root, "dist", "database", "typeorm.datasource.js");
  if (!fs.existsSync(ds)) {
    console.error(
      "[BubbleDrop] Missing dist/database/typeorm.datasource.js — run npm run build first.",
    );
    process.exit(1);
  }
  const cli = path.join(root, "node_modules", "typeorm", "cli.js");
  if (!fs.existsSync(cli)) {
    console.error("[BubbleDrop] typeorm CLI not found.");
    process.exit(1);
  }
  console.log("[BubbleDrop] Running database migrations…");
  const result = spawnSync(
    process.execPath,
    [cli, "migration:run", "-d", ds],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.error) {
    console.error("[BubbleDrop] Migration spawn error:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      "[BubbleDrop] Migrations failed (exit " + result.status + "). Check DB_HOST / DB_* and Postgres.",
    );
    process.exit(result.status ?? 1);
  }
  console.log("[BubbleDrop] Migrations OK.");
}

if (process.env.NODE_ENV === "production" && !skipMigrate) {
  runMigrations();
}

require(path.join(root, "dist", "main.js"));
