import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";
import type { Band } from "./types";

const INITIAL: Band = { visible: true, workflow: "ready" };
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
  on("skill.prompt", async ($, e, next) => {
    if (e.pluginName === "pstack" || e.skill.startsWith("pstack:")) {
      await update($, band, (s) => ({ ...s, workflow: e.skill.replace(/^pstack:/, "") }));
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
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
    if (e.props.hasSurvey) return next(e);
    const below = await next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    if (!state.visible) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" justifyContent="flex-end">
            <Button key="show" label="Show pstack" onPress={async () => {
              await update($, band, (s) => ({ ...s, visible: true }));
              $.ui.invalidate("ui.render");
            }} />
          </Box>
          {below}
        </Box>
      );
    }
    const [usage, agents] = await Promise.all([
      $.session.usage(),
      $.agent.list(),
    ]);
    const running = agents.filter((agent) => agent.status === "running").length;
    const cost = usage.cost === undefined ? "cost unavailable" : `$${usage.cost.usd.toFixed(2)}`;
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1} borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={2}>
            <Text bold color="cyan">pstack</Text>
            <Text>{e.props.isWorking ? "working" : state.workflow}</Text>
            <Text>{cost}</Text>
            <Text>{running ? `${running} helper${running === 1 ? "" : "s"} running` : "one agent"}</Text>
          </Box>
          {!e.props.isWorking && (
            <Box flexDirection="row" flexWrap="wrap" justifyContent="flex-end" flexGrow={1} gap={1}>
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
