import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDelegation, codexSessionEvidence, runCandidate, turnSucceeded, workflowLoaded } from "../tools/check-delegation.mjs";

const reviewPrompt = "Review the changes read-only. Do not edit files.";
const claudeCall = (id, prompt = reviewPrompt, parent = null) => ({ type: "assistant", parent_tool_use_id: parent, message: { content: [{ type: "tool_use", id, name: "Agent", input: { prompt } }] } });
const codexCall = (type, id, prompt = reviewPrompt) => ({ type, item: { type: "collab_tool_call", id, tool: "spawn_agent", prompt, sender_thread_id: "owner" } });
const claudeResult = id => ({ type: "user", tool_use_result: { status: "completed" }, message: { content: [{ type: "tool_result", tool_use_id: id }] } });
const nativeRoot = [{ type: "session_meta", payload: { id: "owner", source: "exec" } }];
const nativeChild = (prompt = reviewPrompt, records = [], parent = "owner", id = "reviewer") => [
  { type: "session_meta", payload: { id, source: { subagent: { thread_spawn: { parent_thread_id: parent } } } } },
  { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] } },
  ...records,
  { type: "event_msg", payload: { type: "task_complete" } },
];

test("ordinary work fails when either host delegates", () => {
  for (const [runtime, record] of [["claude", claudeCall("one")], ["codex", codexCall("item.started", "one")]]) {
    const ordinary = checkDelegation([], runtime, "ordinary");
    expect(ordinary.passed).toBe(true);
    expect(ordinary.delegationPassed).toBe(true);
    expect(ordinary.review.status).toBe("not-required");
    expect(checkDelegation([record], runtime, "ordinary").passed).toBe(false);
  }
});

test("required review reports missing or unfinished reviewers as incomplete", () => {
  for (const [runtime, records] of [
    ["claude", []],
    ["claude", [claudeCall("one")]],
    ["codex", codexSessionEvidence([nativeRoot])],
    ["codex", codexSessionEvidence([nativeRoot, nativeChild().slice(0, -1)])],
  ]) {
    const result = checkDelegation(records, runtime, "required-review");
    expect(result.passed).toBe(false);
    expect(result.delegationPassed).toBe(false);
    expect(result.review.status).toBe("incomplete");
    expect(typeof result.review.reason).toBe("string");
    expect(result.review.reason).not.toBe("");
  }
});

test("completed read-only review briefs still require independent transcript inspection", () => {
  for (const [runtime, records] of [
    ["claude", [claudeCall("one"), claudeResult("one")]],
    ["codex", codexSessionEvidence([nativeRoot, nativeChild()])],
  ]) {
    const result = checkDelegation(records, runtime, "required-review");
    expect(result.passed).toBe(false);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].completed).toBe(true);
    expect(result.delegationPassed).toBe(true);
    expect(result.review.status).toBe("unverified");
    expect(typeof result.review.reason).toBe("string");
    expect(result.review.reason).not.toBe("");
  }
});

test("a completed implementer cannot satisfy required independent review", () => {
  const prompt = "Implement archive filtering in src/store.mjs and run the checks.";
  for (const [runtime, records] of [
    ["claude", [claudeCall("one", prompt), claudeResult("one")]],
    ["codex", codexSessionEvidence([nativeRoot, nativeChild(prompt)])],
  ]) {
    const result = checkDelegation(records, runtime, "required-review");
    expect(result.passed).toBe(false);
    expect(result.delegationPassed).toBe(true);
    expect(result.review.status).toBe("rejected");
    expect(typeof result.review.reason).toBe("string");
    expect(result.review.reason).not.toBe("");
  }
});

test("streamed copies of one delegation count once", () => {
  expect(checkDelegation([claudeCall("one"), claudeCall("one")], "claude", "required-review").calls).toHaveLength(1);
  const records = [codexCall("item.started", "one"), codexCall("item.completed", "one")];
  expect(checkDelegation(records, "codex", "required-review").calls).toHaveLength(1);
});

test("Codex native sessions reveal delegation omitted from the short event stream", () => {
  const root = [{ type: "session_meta", payload: { id: "owner", source: "exec" } }];
  const child = [{ type: "session_meta", payload: { id: "reviewer", source: { subagent: { thread_spawn: { parent_thread_id: "owner" } } } } }];
  expect(checkDelegation(codexSessionEvidence([root]), "codex", "ordinary").passed).toBe(true);
  expect(checkDelegation(codexSessionEvidence([root, child]), "codex", "required-review").passed).toBe(false);
  child.push({ type: "event_msg", payload: { type: "task_complete" } });
  const evidence = codexSessionEvidence([root, child]);
  const result = checkDelegation(evidence, "codex", "required-review");
  expect(result.passed).toBe(false);
  expect(result.delegationPassed).toBe(true);
  expect(result.review.status).toBe("unverified");
  expect(checkDelegation([...evidence, codexCall("item.completed", "same-review")], "codex", "required-review").calls).toHaveLength(1);
  expect(checkDelegation(evidence, "codex", "ordinary").passed).toBe(false);
});

test("native evidence retains the review brief, provenance and applied routing", () => {
  const prompt = "Review the archive filtering read-only. Use gpt-6.1-sol at xhigh. Do not edit files.";
  const child = nativeChild(prompt, [
    { type: "turn_context", payload: { model: "gpt-6-luna", effort: "low" } },
    { type: "response_item", payload: { type: "function_call", name: "exec_command", namespace: "functions", arguments: '{"cmd":"git diff --stat"}', call_id: "read-diff" } },
  ]);
  const evidence = codexSessionEvidence([nativeRoot, child]);
  expect(evidence[1]).toMatchObject({
    id: "reviewer", parent: "owner", prompt,
    model: "gpt-6-luna", effort: "low", wroteFiles: false,
  });
  expect(evidence[1].toolNames).toContain("exec_command");
  expect(checkDelegation(evidence, "codex", "required-review").passed).toBe(false);
});

test("native user_message briefs survive without inventing applied model metadata", () => {
  const prompt = "Review read-only using gpt-6.1-sol at xhigh. Do not edit files.";
  const child = nativeChild().filter(record => record.type !== "response_item");
  child.splice(1, 0, { type: "event_msg", payload: { type: "user_message", message: prompt } });
  child.splice(2, 0, { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Reviewed with gpt-6.1-sol at xhigh." }] } });
  const evidence = codexSessionEvidence([nativeRoot, child]);
  expect(evidence[1]).toMatchObject({ prompt, model: null, effort: null, toolNames: [], wroteFiles: false });
  const result = checkDelegation(evidence, "codex", "required-review");
  expect(result.review.status).toBe("unverified");
  expect(result.passed).toBe(false);
});

test("a read-only brief does not erase observed writes by the reviewer", () => {
  const patch = "*** Begin Patch\n*** Add File: src/archive.mjs\n+export const archived = true;\n*** End Patch";
  const nativeRecords = codexSessionEvidence([nativeRoot, nativeChild(reviewPrompt, [
    { type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: patch, call_id: "write-archive", status: "completed" } },
  ])]);
  const claudeRecords = [
    claudeCall("one"),
    { type: "assistant", parent_tool_use_id: "one", message: { content: [{ type: "tool_use", id: "edit", name: "Edit", input: { file_path: "src/archive.mjs", old_string: "false", new_string: "true" } }] } },
    claudeResult("one"),
  ];
  expect(nativeRecords[1].toolNames).toContain("apply_patch");
  expect(nativeRecords[1].wroteFiles).toBe(true);
  expect(JSON.stringify(nativeRecords)).not.toContain(patch);
  for (const [runtime, records] of [["claude", claudeRecords], ["codex", nativeRecords]]) {
    const result = checkDelegation(records, runtime, "required-review");
    expect(result.delegationPassed).toBe(true);
    expect(result.review.status).toBe("rejected");
    expect(result.passed).toBe(false);
  }
});

test("unrecognized native session provenance cannot pass as ordinary work", () => {
  expect(() => codexSessionEvidence([[{ type: "session_meta", payload: { id: "unknown", source: { subagent: "unknown-format" } } }]])).toThrow("delegation cannot be verified");
});

test("a reviewer that delegates again fails the one-reviewer limit", () => {
  const result = checkDelegation([claudeCall("one"), claudeCall("two", reviewPrompt, "one")], "claude", "required-review");
  expect(result.passed).toBe(false);
  expect(result.delegationPassed).toBe(false);
  expect(result.review.status).toBe("rejected");
  expect(result.calls).toHaveLength(2);
  const native = checkDelegation(codexSessionEvidence([
    nativeRoot, nativeChild(), nativeChild(reviewPrompt, [], "reviewer", "nested-reviewer"),
  ]), "codex", "required-review");
  expect(native.passed).toBe(false);
  expect(native.delegationPassed).toBe(false);
  expect(native.review.status).toBe("rejected");
  expect(native.calls).toHaveLength(2);
});

test("unrelated agent messages and non-spawn collaboration do not count", () => {
  expect(checkDelegation([{ type: "system", subtype: "task_started" }], "claude", "ordinary").passed).toBe(true);
  const record = codexCall("item.completed", "one");
  record.item.tool = "wait";
  expect(checkDelegation([record], "codex", "ordinary").passed).toBe(true);
});

test("workflow loading requires a successful host operation, not the final answer", () => {
  expect(workflowLoaded([{ type: "assistant", message: { content: [{ type: "text", text: "Used pstack:poteto-mode" }] } }], "claude")).toBe(false);
  const call = { type: "assistant", message: { content: [{ type: "tool_use", id: "skill", name: "Skill", input: { skill: "pstack:poteto-mode" } }] } };
  const result = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "skill", is_error: false }] } };
  expect(workflowLoaded([call], "claude")).toBe(false);
  expect(workflowLoaded([call, result], "claude")).toBe(true);
  result.message.content[0].is_error = true;
  expect(workflowLoaded([call, result], "claude")).toBe(false);
  const record = { type: "item.completed", item: { type: "command_execution", command: "cat /skills/poteto-mode/SKILL.md", exit_code: 0, aggregated_output: "# Poteto mode\n## Delegation gate\nDefault to one agent." } };
  expect(workflowLoaded([record], "codex")).toBe(true);
  record.item.exit_code = 1;
  expect(workflowLoaded([record], "codex")).toBe(false);
  record.item = { command: "ls /skills/poteto-mode/SKILL.md", type: "command_execution", exit_code: 0, aggregated_output: "/skills/poteto-mode/SKILL.md" };
  expect(workflowLoaded([record], "codex")).toBe(false);
});

test("an interrupted or failed turn is not a completed behavior check", () => {
  expect(turnSucceeded([{ type: "result", subtype: "error_max_turns", is_error: true }], "claude")).toBe(false);
  expect(turnSucceeded([{ type: "result", subtype: "success", is_error: false }], "claude")).toBe(true);
  expect(turnSucceeded([{ type: "turn.failed" }], "codex")).toBe(false);
  expect(turnSucceeded([{ type: "turn.completed" }], "codex")).toBe(true);
});

test("the live checker reports unverified review separately from definite regressions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "delegation-cli-"));
  const bin = join(cwd, "candidate");
  const checker = new URL("../tools/check-delegation.mjs", import.meta.url).pathname;
  try {
    const files = {
      "src/store.mjs": 'const tasks = [{ title: "Ship notes", archived: false }, { title: "Old draft", archived: true }, { title: "Fix links", archived: false }];\nexport function getTasks({ includeArchived = false } = {}) { return tasks.filter(task => includeArchived || !task.archived); }\n',
      "src/service.mjs": 'import { getTasks } from "./store.mjs";\nexport function getSummary(options) { const tasks = getTasks(options); return { count: tasks.length, titles: tasks.map(task => task.title) }; }\n',
      "src/args.mjs": 'export function parseArgs(args) { if (args.some(arg => arg !== "--include-archived")) throw new Error("Unknown option"); return { includeArchived: args.includes("--include-archived") }; }\n',
      "src/cli.mjs": 'import { parseArgs } from "./args.mjs";\nimport { getSummary } from "./service.mjs";\nconsole.log(JSON.stringify(getSummary(parseArgs(process.argv.slice(2)))));\n',
    };
    for (const [prompt, status, exit] of [[reviewPrompt, "unverified", 2], ["Implement archive filtering.", "rejected", 1]]) {
      const records = [
        { type: "assistant", message: { content: [{ type: "tool_use", id: "skill", name: "Skill", input: { skill: "pstack:poteto-mode" } }] } },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "skill", is_error: false }] } },
        claudeCall("review", prompt), claudeResult("review"),
        { type: "result", subtype: "success", is_error: false },
      ];
      writeFileSync(bin, `#!/usr/bin/env node\nconst fs = require("node:fs");\nfor (const [path, text] of Object.entries(${JSON.stringify(files)})) fs.writeFileSync(path, text);\nfor (const record of ${JSON.stringify(records)}) console.log(JSON.stringify(record));\nprocess.stdin.resume();\n`, { mode: 0o700 });
      const output = join(cwd, status);
      const result = spawnSync(process.execPath, [checker, "--live", "--runtime", "claude", "--scenario", "required-review", "--output", output], {
        cwd, env: { ...process.env, CLAUDE_BIN: bin }, encoding: "utf8", timeout: 15_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(exit);
      const [report] = JSON.parse(readFileSync(join(output, "report.json"), "utf8"));
      expect(report.fixtureChecks).toBe(true);
      expect(report.workflowLoaded).toBe(true);
      expect(report.delegationPassed).toBe(true);
      expect(report.review.status).toBe(status);
      expect(report.passed).toBe(false);
      expect(result.stdout).not.toContain("Passed 1 live cases");
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

async function withProcessFixture(check) {
  const cwd = mkdtempSync(join(tmpdir(), "delegation-process-"));
  const script = 'const fs = require("node:fs"); process.on("SIGTERM", () => {}); fs.writeFileSync("child.pid", String(process.pid)); setInterval(() => {}, 1000);';
  try { await check(cwd, script); }
  finally {
    const pidPath = join(cwd, "child.pid");
    if (existsSync(pidPath)) {
      try { process.kill(Number(readFileSync(pidPath, "utf8")), "SIGKILL"); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("malformed model output rejects and stops the model process", async () => {
  await withProcessFixture(async (cwd, script) => {
    await expect(runCandidate("node", ["-e", script + 'console.log("not json");'], cwd, process.env, "", join(cwd, "stream"))).rejects.toThrow();
    expect(() => process.kill(Number(readFileSync(join(cwd, "child.pid"), "utf8")), 0)).toThrow();
    expect(readFileSync(join(cwd, "stream"), "utf8")).toContain("not json");
  });
});

test("timeout stops a model process that ignores SIGTERM", async () => {
  await withProcessFixture(async (cwd, script) => {
    await expect(runCandidate("node", ["-e", script], cwd, process.env, "", join(cwd, "stream"), 1000)).rejects.toThrow("timed out");
    expect(() => process.kill(Number(readFileSync(join(cwd, "child.pid"), "utf8")), 0)).toThrow();
  });
});

test("interrupting the runner stops its detached model process", async () => {
  await withProcessFixture(async (cwd, script) => {
    const module = new URL("../tools/check-delegation.mjs", import.meta.url).href;
    const wrapper = join(cwd, "runner.mjs");
    writeFileSync(wrapper, `import { runCandidate } from ${JSON.stringify(module)};\ntry { await runCandidate("node", ["-e", ${JSON.stringify(script)}], process.cwd(), process.env, "", "stream"); } catch (error) { console.error(error.message); process.exitCode = 1; }\n`);
    const runner = spawn(process.execPath, [wrapper], { cwd, stdio: ["ignore", "ignore", "pipe"] });
    const closed = new Promise(resolve => runner.on("close", resolve));
    let stderr = "";
    runner.stderr.on("data", chunk => { stderr += chunk; });
    try {
      const deadline = Date.now() + 3000;
      while (!existsSync(join(cwd, "child.pid")) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      expect(existsSync(join(cwd, "child.pid"))).toBe(true);
      runner.kill("SIGINT");
      expect(await closed).toBe(1);
      expect(stderr).toContain("Interrupted by SIGINT");
      expect(() => process.kill(Number(readFileSync(join(cwd, "child.pid"), "utf8")), 0)).toThrow();
    } finally { runner.kill("SIGKILL"); }
  });
});
