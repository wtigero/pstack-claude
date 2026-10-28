import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";
import type { Band } from "./types";

const INITIAL: Band = { visible: true, workflow: "ready", model: "", effort: "" };
const band = atom({ plugin: "pstack", key: "band" } as const, INITIAL);
const WORKFLOWS = [
  { key: "how", label: "Explain", command: "/pstack:how" },
  { key: "poteto-mode", label: "Build", command: "/pstack:poteto-mode" },
  { key: "interrogate", label: "Review", command: "/pstack:interrogate" },
];

async function draft($: EngineInterface, command: string) {
  const current = await $.prompt.read();
  await $.prompt.fill({ text: `${command} ${current.text}`, mode: "replace" });
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "pstack-band",
      description: "Show or hide the pstack session band",
      argumentHint: "[on|off]",
      immediate: true,
    });
    return next(e);
  });

  on("command.run", { command: "pstack-band" }, async ($, e) => {
    const arg = e.args.trim();
    if (arg && arg !== "on" && arg !== "off") return { text: "Usage: /pstack-band [on|off]" };
    const state = await read($, band);
    const visible = arg ? arg === "on" : !state.visible;
    await update($, band, (s) => ({ ...s, visible }));
    $.ui.invalidate("ui.render");
    return { text: `pstack band ${visible ? "on" : "off"}` };
  });

  on("skill.prompt", async ($, e, next) => {
    if (e.pluginName === "pstack" || e.skill.startsWith("pstack:")) {
      await update($, band, (s) => ({ ...s, workflow: e.skill.replace(/^pstack:/, "") }));
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    if (!e.agentId) {
      await update($, band, (s) => ({ ...s, model: e.model, effort: String(e.effort ?? "") }));
      $.ui.invalidate("ui.render");
    }
    return yield* next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    $.ui.invalidate("ui.render");
    return result;
  });

  on("classic.PostModelSwitch", async ($, e, next) => {
    const result = await next(e);
    await update($, band, (s) => ({ ...s, model: "", effort: "" }));
    $.ui.invalidate("ui.render");
    return result;
  });

  on("agent.spawn", async ($, e, next) => {
    const result = await next(e);
    $.ui.invalidate("ui.render");
    return result;
  });

  on("classic.SubagentStop", async ($, e, next) => {
    const result = await next(e);
    $.ui.invalidate("ui.render");
    return result;
  });

  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    $.ui.invalidate("ui.render");
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const state = await read($, band);
    if (!state.visible || e.props.hasSurvey) return next(e);
    const below = await next(e);
    const [model, usage, agents] = await Promise.all([
      $.session.model(),
      $.session.usage(),
      $.agent.list(),
    ]);
    const running = agents.filter((agent) => agent.status === "running").length;
    const cost = usage.cost === undefined ? "cost unavailable" : `$${usage.cost.usd.toFixed(2)}`;
    const effort = state.model === model && state.effort ? ` @${state.effort}` : "";
    const { Box, Text, Button } = $.ui.resolve(e);
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={2}>
            <Text bold color="cyan">pstack</Text>
            <Text>{e.props.isWorking ? "working" : state.workflow}</Text>
            <Text dimColor>{model}{effort}</Text>
            <Text>{cost}</Text>
            <Text>{running ? `${running} helper${running === 1 ? "" : "s"} running` : "one agent"}</Text>
          </Box>
          {!e.props.isWorking && (
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {WORKFLOWS.map((workflow) => (
                <Button key={workflow.key} label={workflow.label} onPress={() => draft($, workflow.command)} />
              ))}
              <Button key="hide" label="Hide" onPress={async () => {
                await update($, band, (s) => ({ ...s, visible: false }));
                $.ui.invalidate("ui.render");
              }} />
            </Box>
          )}
        </Box>
        {below}
      </Box>
    );
  });
};
