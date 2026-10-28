import { expect, test } from "bun:test";
import { checkDelegation, codexSessionEvidence, turnSucceeded, workflowLoaded } from "../tools/check-delegation.mjs";

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
  expect(workflowLoaded([{ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "pstack:poteto-mode" } }] } }], "claude")).toBe(true);
  const record = { type: "item.completed", item: { type: "command_execution", command: "cat /skills/poteto-mode/SKILL.md", exit_code: 0 } };
  expect(workflowLoaded([record], "codex")).toBe(true);
  record.item.exit_code = 1;
  expect(workflowLoaded([record], "codex")).toBe(false);
});

test("an interrupted or failed turn is not a completed behavior check", () => {
  expect(turnSucceeded([{ type: "result", subtype: "error_max_turns", is_error: true }], "claude")).toBe(false);
  expect(turnSucceeded([{ type: "result", subtype: "success", is_error: false }], "claude")).toBe(true);
  expect(turnSucceeded([{ type: "turn.failed" }], "codex")).toBe(false);
  expect(turnSucceeded([{ type: "turn.completed" }], "codex")).toBe(true);
});
