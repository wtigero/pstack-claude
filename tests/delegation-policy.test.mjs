import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { validateHooks } from "../tools/generate.mjs";
import { walk } from "../tools/validate-skills.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const plugin = fileURLToPath(new URL("../plugins/pstack/", import.meta.url));
const read = (path) => readFileSync(join(plugin, path), "utf8");

describe("shared delegation policy", () => {
  test("direct dispatcher entry points load the same gate", () => {
    for (const skill of ["automate-me", "maintain-verification-skill", "recall", "teach", "show-me-your-work", "poteto-mode", "how", "why", "architect", "arena", "interrogate", "reflect", "swarm", "no-comments", "thermos", "thermo-nuclear-review", "thermo-nuclear-code-quality-review"]) {
      const text = read(`skills/${skill}/SKILL.md`);
      expect(text).toContain("## Delegation gate");
      expect(text).toContain("references/delegation.md)");
      expect(text).toContain("Default to one agent.");
    }
  });

  test("keeps review independent and chooses models after the delegation decision", () => {
    const policy = read("skills/poteto-mode/references/delegation.md");
    expect(policy).toContain("The reviewer must not be the author.");
    expect(policy).toContain("Model-routing rows choose a model only after delegation is justified.");
    expect(policy).toContain("An explicit request for parallel candidates");
  });

  test("feature and bug-fix no longer require implementation delegation", () => {
    for (const playbook of ["feature", "bug-fix"]) {
      const text = read(`skills/poteto-mode/playbooks/${playbook}.md`);
      expect(text).toContain("references/delegation.md)");
      expect(text).not.toContain("Mandatory: no skip-with-reason escape");
      expect(text).not.toContain("Delegate investigation and the fix to subagents");
    }
  });

  test("Codex lifecycle hooks cannot load the Claude Mods module", () => {
    const manifest = JSON.parse(read(".codex-plugin/plugin.json"));
    const codexHooks = JSON.parse(read(manifest.hooks));
    const claudeHooks = JSON.parse(read("hooks/hooks.json"));
    expect(codexHooks.modules).toBeUndefined();
    expect(claudeHooks.modules).toEqual(["./band/register.tsx"]);
    expect(read("hooks/session-start-context.md")).toContain("Default to one agent");
  });
});


test("source scans ignore host-generated types without hiding plugin source", () => {
  const root = mkdtempSync(join(tmpdir(), "pstack-mod-types-"));
  try {
    mkdirSync(join(root, ".claude-plugin/types"), { recursive: true });
    mkdirSync(join(root, "hooks"));
    writeFileSync(join(root, ".claude-plugin/types/host.d.ts"), "host declarations");
    writeFileSync(join(root, "hooks/register.tsx"), "plugin source");
    expect(walk(root)).toEqual([join(root, "hooks/register.tsx")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hooks validation rejects a missing or escaping Mods entry point", () => {
  const statOf = (path) => path === "hooks/band/register.tsx" ? { isFile: () => true } : undefined;
  for (const module of ["./missing.tsx", "../../../outside.tsx", "/outside.tsx"]) {
    expect(() => validateHooks(JSON.stringify({ hooks: {}, modules: [module] }), { statOf })).toThrow("must name a file inside the plugin");
  }
  expect(() => validateHooks(JSON.stringify({ hooks: {}, modules: ["./band/register.tsx"] }), { statOf })).not.toThrow();
});
