import { expect, test } from "claude-code/testing";

const SITE = {
  plugin: "pstack",
  component: "AbovePrompt",
  requestId: "pstack-band",
  viewport: { columns: 120, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

function host(on, { agents = [], cost = 1.25, model = "claude-test", draft = "" } = {}) {
  on("session.model", () => ({ value: typeof model === "function" ? model() : model }));
  on("session.usage", () => ({ value: { context: {}, rateLimits: [], ...(cost === null ? {} : { cost: { usd: cost } }) } }));
  on("agent.list", () => ({ value: agents }));
  on("prompt.read", () => ({ value: { text: draft, cursor: draft.length } }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["another mod"] }));
}

for (const surface of ["terminal", "desktop"] as const) {
  test(`shows host usage and composes with other UI on ${surface}`, async ($, on) => {
    host(on);
    const ui = await $.ui.mount({ ...SITE, surface });
    expect(await ui.find({ type: "Text", text: "$1.25" })).toBeDefined();
    expect(await ui.find({ type: "Text", text: "one agent" })).toBeDefined();
    expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
    await ui.unmount();
  });
}

test("counts running helpers and ignores finished agents", async ($, on) => {
  host(on, { agents: [{ id: "1", status: "running" }, { id: "2", status: "completed" }] });
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "1 helper running" })).toBeDefined();
});

test("does not invent a zero cost when the host has no ledger", async ($, on) => {
  host(on, { cost: null });
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "cost unavailable" })).toBeDefined();
});

for (const [key, command] of [["how", "/pstack:how"], ["poteto-mode", "/pstack:poteto-mode"], ["interrogate", "/pstack:interrogate"]]) {
  test(`${key} fills a draft and keeps the user's text`, async ($, on) => {
    host(on, { draft: "inspect this diff" });
    let filled = "";
    on("prompt.fill", ($, e) => { filled = e.text; return { isFilled: true }; });
    const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
    await ui.press({ key });
    expect(filled).toBe(`${command} inspect this diff`);
  });
}

test("hides the band and restores it with its command", async ($, on) => {
  host(on);
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  await ui.press({ key: "hide" });
  expect(await ui.find({ key: "how" })).toBeUndefined();
  expect((await $.command.run({ command: "pstack-band", args: "on" })).text).toBe("pstack band on");
  expect(await ui.find({ key: "how" })).toBeDefined();
});

test("rejects an invalid band command without hiding the band", async ($, on) => {
  host(on);
  expect((await $.command.run({ command: "pstack-band", args: "broken" })).text).toBe("Usage: /pstack-band [on|off]");
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ key: "how" })).toBeDefined();
});

test("yields to surveys", async ($, on) => {
  host(on);
  const ui = await $.ui.mount({ ...SITE, props: { ...SITE.props, hasSurvey: true }, surface: "terminal" });
  expect(await ui.find({ key: "how" })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
});

test("does not offer workflow buttons while a turn runs", async ($, on) => {
  host(on);
  const ui = await $.ui.mount({ ...SITE, props: { ...SITE.props, isWorking: true }, surface: "terminal" });
  expect(await ui.find({ key: "how" })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: "working" })).toBeDefined();
});

test("tracks pstack skill expansion without changing its prompt", async ($, on) => {
  host(on);
  on("skill.prompt", ($, e) => ({ text: e.text }));
  const result = await $.skill.prompt({ skill: "pstack:architect", text: "design contract", pluginName: "pstack", source: "plugin" });
  expect(result.text).toBe("design contract");
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "architect" })).toBeDefined();
});

test("observes main model effort while passing the model stream unchanged", async ($, on) => {
  host(on);
  on("turn.step", async function* ($, e) {
    yield { kind: "text", index: 0, text: "ok" };
    return { turnId: e.turnId, index: e.index, answer: "ok", toolUses: [], stopReason: "end_turn", usage: null };
  });
  const stream = $.turn.step({ turnId: "t", index: 0, model: "claude-test", effort: "high", messageCount: 1 });
  expect((await stream.next()).value.text).toBe("ok");
  expect((await stream.next()).value.answer).toBe("ok");
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "claude-test @high" })).toBeDefined();
});


test("refreshes the idle model after the host switches it", async ($, on) => {
  let model = "claude-test";
  host(on, { model: () => model });
  on("classic.PostModelSwitch", () => ({}));
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "claude-test" })).toBeDefined();
  model = "claude-other";
  await $.classic.PostModelSwitch({ from_model: "claude-test", to_model: model, requested_model: model, source: "command" });
  expect(await ui.find({ type: "Text", text: "claude-other" })).toBeDefined();
});

test("refreshes helper status when a subagent stops", async ($, on) => {
  const agents = [{ id: "1", status: "running" }];
  host(on, { agents });
  on("classic.SubagentStop", () => ({}));
  const ui = await $.ui.mount({ ...SITE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "1 helper running" })).toBeDefined();
  agents[0].status = "completed";
  await $.classic.SubagentStop({ agent_id: "1", agent_type: "general-purpose", agent_transcript_path: "/test/agent.jsonl", stop_hook_active: false });
  expect(await ui.find({ type: "Text", text: "one agent" })).toBeDefined();
});
