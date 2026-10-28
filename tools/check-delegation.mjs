#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const cases = ["ordinary", "required-review"];
const hookKey = "pstack@pstack-wtigero:hooks/codex-hooks.json:session_start:0:0";

export function delegationCalls(records, runtime) {
  const sessions = records.filter(record => record.type === "pstack.session");
  if (runtime === "codex" && sessions.length) return sessions.filter(session => session.parent !== null);
  const calls = new Map();
  for (const record of records) {
    if (runtime === "claude" && record.type === "assistant") {
      for (const block of record.message?.content ?? []) {
        if (block.type === "tool_use" && ["Agent", "Task"].includes(block.name)) {
          calls.set(block.id, { id: block.id, prompt: block.input?.prompt ?? "", parent: record.parent_tool_use_id ?? null });
        }
      }
    }
    if (runtime === "claude" && record.type === "user" && record.tool_use_result?.status === "completed") {
      for (const block of record.message?.content ?? []) {
        const call = calls.get(block.tool_use_id);
        if (block.type === "tool_result" && call && !block.is_error) call.completed = true;
      }
    }
    const item = record.item;
    if (runtime === "codex" && item?.type === "collab_tool_call" && item.tool === "spawn_agent") {
      calls.set(item.id, { id: item.id, prompt: item.prompt ?? "", parent: item.sender_thread_id ?? null });
    }
  }
  return [...calls.values()];
}

export function checkDelegation(records, runtime, scenario) {
  const calls = delegationCalls(records, runtime);
  const expected = scenario === "ordinary" ? 0 : 1;
  const completedReview = calls.length === 1 && calls[0].completed === true && (runtime === "codex" || /review/i.test(calls[0].prompt) && /read.only|do not (?:edit|modify|change)/i.test(calls[0].prompt));
  return { passed: calls.length === expected && (expected === 0 || completedReview), calls, expected };
}

export function codexSessionEvidence(groups) {
  return groups.map(records => {
    const meta = records.find(record => record.type === "session_meta").payload;
    const parent = meta.source?.subagent?.thread_spawn?.parent_thread_id ?? null;
    if (parent === null && meta.source !== "exec") throw new Error("Unsupported native session source; delegation cannot be verified.");
    return {
      type: "pstack.session", id: meta.id,
      parent,
      completed: records.some(record => record.type === "event_msg" && record.payload.type === "task_complete"),
    };
  });
}

function sessionGroups(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sessionGroups(path);
    return entry.name.endsWith(".jsonl") ? [readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line))] : [];
  });
}

export function workflowLoaded(records, runtime) {
  return records.some(record => runtime === "claude"
    ? record.type === "assistant" && record.message?.content?.some(block => block.type === "tool_use" && block.name === "Skill" && block.input?.skill === "pstack:poteto-mode")
    : record.type === "item.completed" && record.item?.type === "command_execution" && record.item.exit_code === 0 && /poteto-mode\/SKILL\.md/.test(record.item.command));
}

export function turnSucceeded(records, runtime) {
  return records.some(record => runtime === "claude"
    ? record.type === "result" && record.subtype === "success" && !record.is_error
    : record.type === "turn.completed");
}

function command(bin, args, cwd, env = process.env) {
  const result = spawnSync(bin, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${bin} ${args[0]} exited ${result.status}: ${result.stderr.slice(-1000)}`);
  return result.stdout;
}

function writeTasksProject(cwd, scenario) {
  mkdirSync(join(cwd, "src"));
  const files = {
    "src/store.mjs": 'const tasks = [{ title: "Ship notes", archived: false }, { title: "Old draft", archived: true }, { title: "Fix links", archived: false }];\nexport function getTasks() { return tasks; }\n',
    "src/service.mjs": 'import { getTasks } from "./store.mjs";\nexport function getSummary() { const tasks = getTasks(); return { count: tasks.length, titles: tasks.map(task => task.title) }; }\n',
    "src/args.mjs": 'export function parseArgs(args) { if (args.length) throw new Error("Unknown option"); return {}; }\n',
    "src/cli.mjs": 'import { parseArgs } from "./args.mjs";\nimport { getSummary } from "./service.mjs";\nparseArgs(process.argv.slice(2));\nconsole.log(JSON.stringify(getSummary()));\n',
    "checks.mjs": 'import assert from "node:assert/strict";\nimport { execFileSync, spawnSync } from "node:child_process";\nimport { getTasks } from "./src/store.mjs";\nimport { getSummary } from "./src/service.mjs";\nimport { parseArgs } from "./src/args.mjs";\nassert.equal(getTasks().length, 2);\nassert.equal(getTasks({ includeArchived: true }).length, 3);\nassert.equal(getSummary({ includeArchived: true }).count, 3);\nassert.deepEqual(parseArgs([]), { includeArchived: false });\nassert.deepEqual(parseArgs(["--include-archived"]), { includeArchived: true });\nassert.equal(JSON.parse(execFileSync(process.execPath, ["src/cli.mjs"], { encoding: "utf8" })).count, 2);\nassert.equal(JSON.parse(execFileSync(process.execPath, ["src/cli.mjs", "--include-archived"], { encoding: "utf8" })).count, 3);\nassert.notEqual(spawnSync(process.execPath, ["src/cli.mjs", "--unknown"]).status, 0);\nconsole.log("Checks passed");\n',
  };
  for (const [path, text] of Object.entries(files)) writeFileSync(join(cwd, path), text);
  const rules = "# Project rules\n\nKeep archive filtering in getTasks and pass options through the existing layers. Keep checks.mjs unchanged.\n" +
    (scenario === "required-review" ? "\nAn independent read-only review is required before completion. Use one reviewer who did not write the changes. The reviewer must not edit files or delegate further.\n" : "");
  for (const name of ["AGENTS.md", "CLAUDE.md"]) writeFileSync(join(cwd, name), rules);
  command("git", ["init", "-q"], cwd);
  command("git", ["add", "."], cwd);
  command("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", "commit", "-qm", "Initial tasks"], cwd);
  return files["checks.mjs"];
}

function prepareCodexHome(home, bin) {
  const configured = process.env.CODEX_HOME || join(homedir(), ".codex");
  const configPath = join(configured, "config.toml");
  const config = Bun.TOML.parse(readFileSync(configPath, "utf8"));
  const trust = config.hooks?.state?.[hookKey];
  if (!trust?.trusted_hash) throw new Error("Trust the installed fork's session hook before running the Codex cases.");
  mkdirSync(home, { mode: 0o700 });
  const auth = join(configured, "auth.json");
  if (existsSync(auth)) symlinkSync(auth, join(home, "auth.json"));
  let text = 'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "high"\n[features]\nmulti_agent = true\n';
  text += `[hooks.state.${JSON.stringify(hookKey)}]\n`;
  for (const key of ["trusted_hash", "trusted_content_hash"]) {
    if (trust[key]) text += `${key} = ${JSON.stringify(trust[key])}\n`;
  }
  writeFileSync(join(home, "config.toml"), text, { mode: 0o600 });
  const sheetPath = join(configured, "pstack-models.md");
  if (existsSync(sheetPath)) {
    const rows = readFileSync(sheetPath, "utf8").split("\n").filter(line => /^[a-z][a-z ,/-]*:\s*(?:gpt-|high\b|xhigh\b)/.test(line));
    writeFileSync(join(home, "AGENTS.md"), `# Models\n\n${rows.join("\n")}\n`);
    writeFileSync(join(home, "pstack-models.md"), `${rows.join("\n")}\nsession hook: on\n`);
  }
  const userRules = join(configured, "AGENTS.md");
  if (existsSync(userRules)) {
    const text = readFileSync(userRules, "utf8");
    const heading = "## pstack model routing";
    if (text.includes(heading)) writeFileSync(join(home, "AGENTS.md"), text.slice(text.indexOf(heading)));
  }
  const env = { ...process.env, CODEX_HOME: home };
  command(bin, ["plugin", "marketplace", "add", repo, "--json"], repo, env);
  command(bin, ["plugin", "add", "pstack@pstack-wtigero", "--json"], repo, env);
  return env;
}

async function runCandidate(bin, args, cwd, env, prompt, logPath) {
  const log = createWriteStream(logPath, { mode: 0o600 });
  const errors = createWriteStream(`${logPath}.stderr`, { mode: 0o600 });
  const records = [];
  let pending = "";
  const child = spawn(bin, args, { cwd, env, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.on("data", chunk => {
    log.write(chunk);
    pending += chunk;
    let end;
    while ((end = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      if (line.trim()) records.push(JSON.parse(line));
    }
  });
  child.stderr.pipe(errors);
  child.stdin.end(prompt);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (process.platform === "win32") child.kill();
    else process.kill(-child.pid, "SIGTERM");
  }, 10 * 60_000);
  try {
    const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    if (timedOut || code !== 0) throw new Error(`${bin} ${timedOut ? "timed out" : `exited ${code}`}; see ${logPath}`);
    return records;
  } finally {
    clearTimeout(timer);
    log.end(); errors.end();
  }
}

async function main() {
  const { values } = parseArgs({ options: { live: { type: "boolean" }, runtime: { type: "string", default: "both" }, scenario: { type: "string", default: "both" }, output: { type: "string" } } });
  if (!["both", "claude", "codex"].includes(values.runtime)) throw new Error("--runtime must be claude, codex, or both");
  if (!["both", ...cases].includes(values.scenario)) throw new Error("--scenario must be ordinary, required-review, or both");
  if (!values.live) {
    console.log("Run with --live to make model calls in disposable projects. Optional: --runtime claude|codex|both --scenario ordinary|required-review|both --output <directory>.");
    return;
  }
  const output = values.output ? resolve(values.output) : mkdtempSync(join(tmpdir(), "pstack-delegation-"));
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const reports = [];
  const runtimes = values.runtime === "both" ? ["claude", "codex"] : [values.runtime];
  for (const runtime of runtimes) {
    for (const scenario of values.scenario === "both" ? cases : [values.scenario]) {
      const cwd = mkdtempSync(join(tmpdir(), "harbor-tasks-"));
      const home = `${cwd}-config`;
      const originalChecks = writeTasksProject(cwd, scenario);
      const logPath = join(output, `${runtime}-${scenario}.jsonl`);
      console.log(`Running ${runtime}/${scenario}`);
      try {
        const prompt = "Use pstack:poteto-mode to add --include-archived to this tasks CLI. Hide archived tasks by default, and include all tasks when the flag is present. Support getTasks({ includeArchived }) and getSummary({ includeArchived }) by passing the option through the existing layers. Keep unknown options rejected. Run node checks.mjs. Keep the change scoped and report the result.";
        const bin = runtime === "claude" ? process.env.CLAUDE_BIN || "claude" : process.env.CODEX_BIN || "codex";
        const env = runtime === "codex" ? prepareCodexHome(home, bin) : process.env;
        const args = runtime === "claude"
          ? ["--print", "--model", "sonnet", "--effort", "high", "--max-turns", "18", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Glob,Grep,Skill,Agent,TaskOutput,Bash(node checks.mjs*),Bash(git diff *),Bash(git status *)", "--setting-sources", "", "--plugin-dir", join(repo, "plugins/pstack"), "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--output-format", "stream-json", "--verbose"]
          : ["exec", "--json", "--model", "gpt-6.1-sol", "--config", 'model_reasoning_effort="high"', "--sandbox", "workspace-write", "-"];
        const records = await runCandidate(bin, args, cwd, env, prompt, logPath);
        if (runtime === "codex" && existsSync(join(home, "sessions"))) {
          cpSync(join(home, "sessions"), join(output, `${runtime}-${scenario}-sessions`), { recursive: true });
          records.push(...codexSessionEvidence(sessionGroups(join(home, "sessions"))));
        }
        if (runtime === "codex" && !records.some(record => record.type === "pstack.session" && record.parent === null)) throw new Error(`No native session evidence; inspect ${logPath}`);
        if (!turnSucceeded(records, runtime)) throw new Error(`${runtime}/${scenario} did not complete successfully; inspect ${logPath}`);
        if (readFileSync(join(cwd, "checks.mjs"), "utf8") !== originalChecks) throw new Error("The candidate modified checks.mjs");
        command("node", ["checks.mjs"], cwd);
        const report = { runtime, scenario, ...checkDelegation(records, runtime, scenario), workflowLoaded: workflowLoaded(records, runtime), fixtureChecks: true, logPath };
        report.passed &&= report.workflowLoaded;
        reports.push(report);
        writeFileSync(join(output, "report.json"), JSON.stringify(reports, null, 2) + "\n");
        if (!report.passed) throw new Error(`${runtime}/${scenario}: expected ${report.expected} delegation(s), saw ${report.calls.length}; inspect ${logPath}`);
      } finally {
        rmSync(home, { recursive: true, force: true });
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  }
  console.log(`Passed ${reports.length} live cases; report: ${join(output, "report.json")}`);
}

if (import.meta.main) await main();
