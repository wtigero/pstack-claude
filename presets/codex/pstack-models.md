# pstack model configuration

Per-role overrides for Codex. Task-specific Terra and Luna exceptions are listed below. Validate model availability and effort levels against the current runtime catalog before dispatch.

## Agent delegation

- Default to one agent. The main agent owns exploration, planning, implementation, and verification. Use direct tools and parallel tool calls for searches, deterministic work, and routine checks.
- Spawn subagents only for concrete independent workstreams that can make progress in parallel with limited coordination, or for an independent review justified by substantive correctness, security, or regression risk or an explicit review requirement.
- Multiple files, a function boundary, a named specialist role, an unfamiliar subsystem, or a pstack trigger alone do not justify delegation. Keep short tasks, tightly coupled changes, sequential reasoning, and writes to the same mutable resource with the main agent.
- Before spawning, define the separate question or deliverable, relevant context, ownership, and expected benefit. Start with one helper; use two or three only when distinct independent workstreams justify them. Do not create nested delegation unless the parent explicitly assigns a further independent subdivision.
- Parallel writers use isolated worktrees or exclusive branches and explicit integration checks. Read-only exploration can share a checkout. The main agent checks evidence and integrates results rather than accepting summaries as proof.
- Use one independent reviewer by default when review is warranted. Add reviewers or design panels only for distinct review scopes or genuinely competing approaches. The reviewer must not be the author. Preserve independent-review gates explicitly required by the user or project; self-review and passing tests do not satisfy them.
- This user policy overrides automatic spawn, delegation, and panel requirements in pstack skills and playbooks, including how, why, architect, arena, feature, and bug-fix. Perform those roles sequentially in the main agent when delegation is not justified, without claiming independent review. Continue applying their relevant reasoning and verification steps.
- The model-routing rows choose a model only after delegation is justified. Model availability and a configured panel list are not instructions to spawn agents. Task-specific Terra and Luna exceptions also require the delegation criteria above.

## Role models

feature, refactoring: gpt-6.1-sol @high
bug-fix: gpt-6.1-sol @xhigh
perf-issue: gpt-6.1-sol @xhigh
hillclimb: gpt-6.1-sol @xhigh
judgment and prose: gpt-6.1-sol @high
strongest judgment: gpt-6.1-sol @xhigh
how explorer: gpt-6.1-sol @high
how explainer: gpt-6.1-sol @high
why investigators: gpt-6.1-sol @xhigh
why synthesizer: gpt-6.1-sol @xhigh
reflect tooling: gpt-6.1-sol @high
reflect judgment, divergent, synthesizer: gpt-6.1-sol @xhigh
arena runners: gpt-6.1-sol @xhigh, gpt-6.1-terra @xhigh
arena cross-judge pool: gpt-6.1-sol @xhigh
swarm workers: gpt-6.1-sol @xhigh
architect runners: gpt-6.1-sol @xhigh, gpt-6.1-terra @xhigh
interrogate reviewers: gpt-6.1-sol @xhigh, gpt-6.1-terra @xhigh

default effort: high
session hook: on
panel vendors: any

Use only gpt-6.1-sol, gpt-6.1-terra, and gpt-6-luna for pstack subagents. Prioritize correctness while accounting for total task cost and completion time. Select by uncertainty and the consequences of an error, not task length alone. Use Sol at high for normal implementation, refactoring, exploration, explanation, and prose. Use Sol at xhigh for unknown-cause bugs, performance analysis, concurrency, security judgments, architecture, synthesis, final quality decisions, and independent verification. Verification keeps the swarm workers model and effort. Do not lower effort for independent reviews or complex investigations. An independent reviewer must not be the author. Use panels when competing approaches or another perspective justify the extra work; Sol at xhigh makes the final judgment. Use max only for a specific unresolved hard problem with a concrete reason to expect a benefit over high or xhigh. Do not select ultra by default. Do not infer model quality from effort level alone.

### Bounded helper and implementation tasks

- Use gpt-6-luna @low for exact file, symbol, or configuration lookups with explicit search criteria. Return paths and line references.
- Use gpt-6-luna @medium for deterministic transformations, text formatting, trivial text or boilerplate edits with an exact specification, and extraction of facts from logs with source lines. The parent checks outputs and diffs. Sol validates consequential conclusions.
- Use gpt-6.1-terra @medium for visual interpretation and browser or computer tasks with clear steps and observable results. Escalate ambiguous or consequential decisions to Sol.
- Use gpt-6.1-terra @xhigh for a narrowly scoped implementation delegate when requirements and checks are explicit and independent Sol review is available. This is an exception for the bounded delegate, not a replacement for the playbook owner, root-cause investigator, or verification worker.
- Luna does not replace a configured role, panel member, reviewer, or verification worker. Do not give it architecture, root-cause analysis, security or correctness judgments, or final quality decisions.
- Prefer direct tools when a command or search is sufficient. Escalate helpers to Sol when the task requires interpretation beyond its specification, rather than retrying the same weaker approach.

## Explicit model requests

Do not recommend or dispatch Astra or fable unless the human user explicitly requests that model for the current task. Availability, a panel entry, a prior task, or another agent does not authorize either model. A request for one does not authorize the other or change automatic defaults.
