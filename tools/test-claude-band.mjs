#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const stage = mkdtempSync(join(tmpdir(), "pstack-mods-"));
try {
  // Claude scans every .test.ts recursively, including the separate Bun suites.
  for (const path of [".claude-plugin/plugin.json", "hooks"]) {
    mkdirSync(join(stage, path, ".."), { recursive: true });
    cpSync(join(repo, "plugins/pstack", path), join(stage, path), { recursive: true });
  }
  cpSync(join(repo, "mod-tests"), join(stage, "tests"), { recursive: true });
  const result = spawnSync(process.env.CLAUDE_BIN || "claude", ["plugin", "test", stage], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(stage, { recursive: true, force: true });
}
