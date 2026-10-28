import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDelegation, codexSessionEvidence, runCandidate, turnSucceeded, workflowLoaded } from "../tools/check-delegation.mjs";

const reviewPrompt = "Review the changes read-only. Do not edit files.";
const claudeCall = (id, prompt = reviewPrompt, parent = null) => ({ type: "assistant", parent_tool_use_id: parent, message: { content: [{ type: "tool_use", id, name: "Agent", input: { prompt } }] } });
const codexCall = (type, id, prompt = reviewPrompt) => ({ type, item: { type: "collab_tool_call", id, tool: "spawn_agent", prompt, sender_thread_id: "owner" } });
const claudeResult = id => ({ type: "user", tool_use_result: { status: "completed" }, message: { content: [{ type: "tool_result", tool_use_id: id }] } });

test("ordinary work fails when either host delegates", () => {
  for (const [runtime, record] of [["claude", claudeCall("one")], ["codex", codexCall("item.started", "one")]]) {
    expect(checkDelegation([], runtime, "ordinary").passed).toBe(true);
    expect(checkDelegation([record], runtime, "ordinary").passed).toBe(false);
  }
});

test("required review needs an actual read-only review call", () => {
  expect(checkDelegation([], "claude", "required-review").passed).toBe(false);
  expect(checkDelegation([claudeCall("one")], "claude", "required-review").passed).toBe(false);
  expect(checkDelegation([claudeCall("one"), claudeResult("one")], "claude", "required-review").passed).toBe(true);
  expect(checkDelegation([claudeCall("one", "Implement this feature")], "claude", "required-review").passed).toBe(false);
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
  expect(checkDelegation(evidence, "codex", "required-review").passed).toBe(true);
  expect(checkDelegation([...evidence, codexCall("item.completed", "same-review")], "codex", "required-review").calls).toHaveLength(1);
  expect(checkDelegation(evidence, "codex", "ordinary").passed).toBe(false);
});

test("unrecognized native session provenance cannot pass as ordinary work", () => {
  expect(() => codexSessionEvidence([[{ type: "session_meta", payload: { id: "unknown", source: { subagent: "unknown-format" } } }]])).toThrow("delegation cannot be verified");
});

test("a reviewer that delegates again fails the one-reviewer limit", () => {
  const result = checkDelegation([claudeCall("one"), claudeCall("two", reviewPrompt, "one")], "claude", "required-review");
  expect(result.passed).toBe(false);
  expect(result.calls).toHaveLength(2);
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
