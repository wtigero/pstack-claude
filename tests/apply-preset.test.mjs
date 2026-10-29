import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planPreset, applyPlan, mergeSheet } from "../tools/apply-preset.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const cli = join(repo, "tools/apply-preset.mjs");
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "pstack preset-"));
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const json = path => JSON.parse(readFileSync(path, "utf8"));
const invoke = (args, env = {}) => spawnSync("node", [cli, ...args], { env: { ...process.env, ...env }, encoding: "utf8" });

test("preview leaves a new config directory absent", () => fixture(root => {
  const dir = join(root, "profile with spaces");
  const result = invoke(["--runtime", "claude", "--config-dir", dir]);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).mode).toBe("preview");
  expect(JSON.parse(result.stdout).changed).toHaveLength(3);
  expect(existsSync(dir)).toBe(false);
}));

test("Claude apply preserves settings and notes, imports once, and is a no-op on repeat", () => fixture(root => {
  const settings = { enabledPlugins: { "ponytail@ponytail": true }, permissions: { allow: ["Read"] }, modelSettings: { "claude-sonnet-5-5": { effortLevel: "medium", custom: true }, other: { effortLevel: "low" } } };
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "settings.json"), JSON.stringify(settings), { mode: 0o640 });
  writeFileSync(join(root, "pstack-models.md"), "# My models\nfeature, refactoring: old\nfeature, refactoring: duplicate\n\nKeep this custom note.\n");
  writeFileSync(join(root, "CLAUDE.md"), `# Rules\nKeep my instructions.\n@${join(root, "pstack-models.md").replaceAll(" ", "\\ ")}\n@pstack-models.md\n@other/pstack-models.md\n`);
  const backups = applyPlan(planPreset("claude", root));
  expect(backups).toHaveLength(3);
  expect(backups.map(path => statSync(path).mode & 0o777)).toEqual([0o600, 0o600, 0o600]);
  expect(json(backups.find(path => path.endsWith("settings.json")))).toEqual(settings);
  const after = json(join(root, "settings.json"));
  expect(after).toMatchObject({ ...settings, model: "sonnet", modelSettings: { ...settings.modelSettings, "claude-sonnet-5-5": { effortLevel: "high", custom: true } } });
  expect(statSync(join(root, "settings.json")).mode & 0o777).toBe(0o640);
  const instructions = readFileSync(join(root, "CLAUDE.md"), "utf8");
  expect(instructions).toContain("Keep my instructions.");
  expect(instructions).toContain("@other/pstack-models.md");
  expect(instructions).not.toContain(`@${join(root, "pstack-models.md").replaceAll(" ", "\\ ")}`);
  expect(instructions.split("\n").filter(line => line === "@pstack-models.md")).toHaveLength(1);
  const sheet = readFileSync(join(root, "pstack-models.md"), "utf8");
  expect(sheet).toContain("Keep this custom note.");
  expect(sheet.match(/^feature, refactoring:/gm)).toHaveLength(1);
  expect(sheet).toContain("## Bounded Haiku helpers");
  expect(planPreset("claude", root)).toEqual([]);
}));

test("Codex apply preserves unrelated instructions and converges legacy rows into one managed block", () => fixture(root => {
  writeFileSync(join(root, "AGENTS.md"), "# Rules\nKeep global rules.\n\n## pstack model routing\nfeature, refactoring: old\ndefault effort: low\nKeep my pstack note.\n\n## Other rules\nKeep this section.\n");
  writeFileSync(join(root, "config.toml"), 'model = "my-session-model"\n');
  applyPlan(planPreset("codex", root));
  const instructions = readFileSync(join(root, "AGENTS.md"), "utf8");
  expect(instructions).toContain("Keep global rules.");
  expect(instructions).toContain("Keep my pstack note.");
  expect(instructions).toContain("## Other rules\nKeep this section.");
  expect(instructions.match(/^feature, refactoring:/gm)).toHaveLength(1);
  expect(instructions).toContain("feature, refactoring: gpt-6.1-sol @high");
  expect(instructions).toContain("explicitly requests Astra for the current task");
  expect(instructions).not.toMatch(/^session hook:/m);
  expect(readFileSync(join(root, "config.toml"), "utf8")).toBe('model = "my-session-model"\n');
  expect(planPreset("codex", root)).toEqual([]);
}));

test("all uses each runtime's configured home without mixing model families", () => fixture(root => {
  const claude = join(root, "Claude Home"), codex = join(root, "Codex Home");
  const env = { CLAUDE_CONFIG_DIR: claude, CODEX_HOME: codex };
  const first = invoke(["--runtime", "all", "--apply"], env);
  expect(first.status).toBe(0);
  expect(readFileSync(join(claude, "pstack-models.md"), "utf8")).toContain("feature, refactoring: sonnet @high");
  expect(readFileSync(join(codex, "pstack-models.md"), "utf8")).toContain("feature, refactoring: gpt-6.1-sol @high");
  expect(JSON.parse(invoke(["--runtime", "all", "--apply"], env).stdout).changed).toEqual([]);
}));

test("invalid settings prevent writes to either runtime", () => fixture(root => {
  const claude = join(root, "claude"), codex = join(root, "codex");mkdirSync(claude);
  writeFileSync(join(claude, "settings.json"), '{"privateToken":"do-not-print-this",broken}');
  const result = invoke(["--runtime", "all", "--apply"], { CLAUDE_CONFIG_DIR: claude, CODEX_HOME: codex });
  expect(result.status).toBe(1);
  expect(existsSync(join(claude, "pstack-models.md"))).toBe(false);
  expect(existsSync(codex)).toBe(false);
  expect(readFileSync(join(claude, "settings.json"), "utf8")).toBe('{"privateToken":"do-not-print-this",broken}');
  expect(result.stderr).not.toContain("do-not-print-this");
}));

test("malformed managed markers refuse changes", () => fixture(root => {
  writeFileSync(join(root, "AGENTS.md"), "Keep this.\n<!-- pstack:preset:start -->\nIncomplete block\n");
  expect(() => planPreset("codex", root)).toThrow("markers");
  expect(existsSync(join(root, "pstack-models.md"))).toBe(false);
}));

test("apply refuses a file changed after planning", () => fixture(root => {
  const plan = planPreset("claude", root);
  writeFileSync(join(root, "CLAUDE.md"), "New user instruction.\n");
  expect(() => applyPlan(plan)).toThrow("changed since preview");
  expect(existsSync(join(root, "settings.json"))).toBe(false);
  expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("New user instruction.\n");
}));

test("applying to a symlinked settings file preserves the link", () => fixture(root => {
  const target = join(root, "actual-settings.json");
  writeFileSync(target, JSON.stringify({ enabledPlugins: { other: true } }));
  symlinkSync(target, join(root, "settings.json"));
  applyPlan(planPreset("claude", root));
  expect(lstatSync(join(root, "settings.json")).isSymbolicLink()).toBe(true);
  expect(json(target)).toMatchObject({ model: "sonnet", enabledPlugins: { other: true } });
}));


test("overlapping runtime homes refuse writes", () => fixture(root => {
  const home = join(root, "shared");
  const result = invoke(["--runtime", "all", "--apply"], { CLAUDE_CONFIG_DIR: home, CODEX_HOME: home });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("overlap");
  expect(existsSync(home)).toBe(false);
}));


test("symlink targets with the same basename keep distinct backups", () => fixture(root => {
  const left = join(root, "left"), right = join(root, "right");mkdirSync(left);mkdirSync(right);
  const sheet = join(left, "same.json"), settings = join(right, "same.json");
  writeFileSync(sheet, "feature, refactoring: old\n");
  writeFileSync(settings, '{"custom":true}');
  symlinkSync(sheet, join(root, "pstack-models.md"));
  symlinkSync(settings, join(root, "settings.json"));
  const backups = applyPlan(planPreset("claude", root));
  expect(backups).toHaveLength(2);
  expect(new Set(backups).size).toBe(2);
  expect(readFileSync(backups.find(path => path.endsWith("pstack-models.md")), "utf8")).toBe("feature, refactoring: old\n");
  expect(json(backups.find(path => path.endsWith("settings.json")))).toEqual({ custom: true });
}));

test("an already-applied runtime still owns its sheet during overlap checks", () => fixture(root => {
  const home = join(root, "shared");
  expect(invoke(["--runtime", "claude", "--config-dir", home, "--apply"]).status).toBe(0);
  const before = readFileSync(join(home, "pstack-models.md"), "utf8");
  const result = invoke(["--runtime", "all", "--apply"], { CLAUDE_CONFIG_DIR: home, CODEX_HOME: home });
  expect(result.status).toBe(1);
  expect(readFileSync(join(home, "pstack-models.md"), "utf8")).toBe(before);
  expect(existsSync(join(home, "AGENTS.md"))).toBe(false);
}));

test("directory aliases cannot hide overlapping runtime ownership", () => fixture(root => {
  const alias = join(root, "alias");symlinkSync(root, alias);
  const home = join(root, "shared"), aliasHome = join(alias, "shared");
  const result = invoke(["--runtime", "all", "--apply"], { CLAUDE_CONFIG_DIR: home, CODEX_HOME: aliasHome });
  expect(result.status).toBe(1);
  expect(existsSync(home)).toBe(false);
}));

test("dangling instruction links are refused before any file is written", () => fixture(root => {
  const link = join(root, "CLAUDE.md"), target = join(root, "missing-instructions.md");
  symlinkSync(target, link);
  const result = invoke(["--runtime", "claude", "--config-dir", root, "--apply"]);
  expect(result.status).toBe(1);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(existsSync(target)).toBe(false);
  expect(existsSync(join(root, "pstack-models.md"))).toBe(false);
  expect(existsSync(join(root, "settings.json"))).toBe(false);
}));


test("unmarked canonical presets move into one managed policy without duplication", () => {
  for (const runtime of ["claude", "codex"]) {
    const preset = readFileSync(join(repo, "presets", runtime, "pstack-models.md"), "utf8");
    const merged = mergeSheet(preset, preset);
    expect(merged.match(/Default to one agent\./g)).toHaveLength(1);
    expect(mergeSheet(merged, preset)).toBe(merged);
  }
  const legacy = readFileSync(join(repo, "presets/claude/pstack-models.md"), "utf8");
  const updated = legacy.replace("Default to one agent.", "The main agent remains the default owner.");
  const migrated = mergeSheet(legacy, updated);
  expect(migrated).not.toContain("Default to one agent.");
  expect(migrated).toContain("The main agent remains the default owner.");
});
