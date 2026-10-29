#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, copyFileSync, chmodSync, statSync, lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repo = fileURLToPath(new URL("..", import.meta.url));
const models = JSON.parse(readFileSync(join(repo, "plugins/pstack/models.json"), "utf8"));
const keys = new Set([...models.roles.map(role => role.role), "default effort", "session hook", "panel vendors"]);
const start = "<!-- pstack:preset:start -->";
const end = "<!-- pstack:preset:end -->";
const policyStart = "<!-- pstack:policy:start -->";
const policyEnd = "<!-- pstack:policy:end -->";
const read = path => existsSync(path) ? readFileSync(path, "utf8") : "";
const keyOf = line => keys.has(line.split(":")[0]) ? line.split(":")[0] : null;

function managed(text, open, close, body) {
  const opening = text.indexOf(open);
  const closing = text.indexOf(close);
  if (opening < 0 && closing < 0) return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${open}\n${body.trim()}\n${close}\n`;
  if (opening < 0 || closing < opening || text.indexOf(open, opening + open.length) >= 0 || text.indexOf(close, closing + close.length) >= 0) throw new Error("Invalid or duplicate pstack preset markers; no files were changed.");
  return text.slice(0, opening) + `${open}\n${body.trim()}\n${close}` + text.slice(closing + close.length);
}

export function mergeSheet(current, preset) {
  const values = new Map(preset.split("\n").filter(line => keyOf(line)).map(line => [keyOf(line), line]));
  const seen = new Set();
  const rows = current.split("\n").flatMap(line => {
    const key = keyOf(line);
    if (!key || !values.has(key)) return [line];
    if (seen.has(key)) return [];
    seen.add(key);
    return [values.get(key)];
  });
  const missing = [...values].filter(([key]) => !seen.has(key)).map(([, line]) => line);
  const policy = preset.split("\n").filter(line => !keyOf(line)).join("\n").replace(/^# [^\n]*\n/, "").trim();
  let text = current.trim() ? rows.join("\n") : "# pstack model configuration\n";
  if (missing.length) text = `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${missing.join("\n")}\n`;
  return managed(text, policyStart, policyEnd, policy);
}

export function mergeInstructions(current, preset) {
  let text = current;
  if (!text.includes(start)) {
    const heading = /^## pstack model routing[^\n]*\r?\n/m.exec(text);
    if (heading) {
      const from = heading.index + heading[0].length;
      const next = /^#{1,2} /m.exec(text.slice(from));
      const until = next ? from + next.index : text.length;
      const rest = text.slice(from, until).split("\n").filter(line => !keyOf(line)).join("\n");
      text = text.slice(0, from) + rest + text.slice(until);
    }
  }
  const body = preset.split("\n").filter(line => !["session hook", "panel vendors"].includes(keyOf(line))).join("\n");
  return managed(text, start, end, body);
}

function deepMerge(current, overlay) {
  if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error("Expected an object in the existing Claude settings overlay target.");
  const result = { ...current };
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(current?.[key] ?? {}, value) : value;
  }
  return result;
}

export function planPreset(runtime, configDir) {
  if (!["claude", "codex"].includes(runtime)) throw new Error(`Unsupported preset runtime: ${runtime}`);
  const preset = readFileSync(join(repo, "presets", runtime, "pstack-models.md"), "utf8");
  const sheet = join(configDir, "pstack-models.md");
  const instructions = join(configDir, runtime === "claude" ? "CLAUDE.md" : "AGENTS.md");
  const files = [{ path: sheet, content: mergeSheet(read(sheet), preset), label: "model sheet and shared policy" }];
  const existing = read(instructions);
  if (runtime === "claude") {
    const lines = existing.split("\n").filter(line => {
      const value = line.trim();
      if (!value.startsWith("@")) return true;
      const include = value.slice(1).replace(/\\ /g, " ");
      const path = include.startsWith("~/") ? join(homedir(), include.slice(2)) : resolve(configDir, include);
      return path !== sheet;
    });
    files.push({ path: instructions, content: `${lines.join("\n").trimEnd()}${lines.some(line => line.trim()) ? "\n\n" : ""}@pstack-models.md\n`, label: "relative model-sheet import" });
    const settingsPath = join(configDir, "settings.json");
    const settingsText = read(settingsPath);
    let settings = {};
    try { if (settingsText) settings = JSON.parse(settingsText); }
    catch { throw new Error(`Invalid Claude settings JSON at ${settingsPath}; no files were changed.`); }
    const overlay = JSON.parse(readFileSync(join(repo, "presets/claude/settings-overlay.json"), "utf8"));
    const merged = deepMerge(settings, overlay);
    files.push({ path: settingsPath, content: JSON.stringify(merged) === JSON.stringify(settings) ? settingsText : JSON.stringify(merged, null, 2) + "\n", label: "Sonnet default and per-model effort" });
  } else {
    files.push({ path: instructions, content: mergeInstructions(existing, preset), label: "managed pstack routing and policy" });
  }
  return files.map(file => {
    const target = existsSync(file.path) && lstatSync(file.path).isSymbolicLink() ? realpathSync(file.path) : file.path;
    return { ...file, configPath: file.path, path: target, runtime, configDir, before: read(target), existed: existsSync(target) };
  }).filter(file => file.before !== file.content);
}

export function applyPlan(files) {
  for (const file of files) if (read(file.path) !== file.before) throw new Error(`Configuration changed since preview: ${file.path}`);
  const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
  const backups = [];
  for (const file of files.filter(file => file.existed)) {
    const backupDir = join(file.configDir, ".pstack-backups", stamp);
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backup = join(backupDir, basename(file.configPath));
    copyFileSync(file.path, backup);
    chmodSync(backup, 0o600);
    backups.push(backup);
  }
  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true });
    const temp = `${file.path}.pstack-${stamp}.tmp`;
    writeFileSync(temp, file.content, { flag: "wx", mode: file.existed ? statSync(file.path).mode & 0o777 : 0o600 });
    renameSync(temp, file.path);
  }
  return backups;
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { runtime: { type: "string" }, "config-dir": { type: "string" }, apply: { type: "boolean" }, help: { type: "boolean" } }, strict: true });
  if (values.help || !values.runtime) {
    console.log("Usage: node tools/apply-preset.mjs --runtime claude|codex|all [--config-dir PATH] [--apply]\nPreview is the default. --apply backs up changed files and writes the preset. Plugin installation and hook trust stay under the native CLIs.");
    return;
  }
  if (!["claude", "codex", "all"].includes(values.runtime)) throw new Error("Runtime must be claude, codex, or all.");
  if (values.runtime === "all" && values["config-dir"]) throw new Error("--config-dir requires one runtime.");
  const runtimes = values.runtime === "all" ? ["claude", "codex"] : [values.runtime];
  const files = runtimes.flatMap(runtime => planPreset(runtime, resolve(values["config-dir"] || (runtime === "claude" ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME) || join(homedir(), runtime === "claude" ? ".claude" : ".codex"))));
  if (new Set(files.map(file => file.path)).size !== files.length) throw new Error("Runtime configuration files overlap; use separate Claude and Codex homes.");
  const backups = values.apply ? applyPlan(files) : [];
  console.log(JSON.stringify({ mode: values.apply ? "apply" : "preview", changed: files.map(({ runtime, path, label }) => ({ runtime, path, label })), backups }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
