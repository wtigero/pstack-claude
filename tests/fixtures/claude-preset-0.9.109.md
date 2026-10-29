# pstack model configuration

These Claude Code model and effort overrides take precedence over bundled role defaults and automatic effort reductions. Use the configured effort for each role. Runtime aliases resolve to the currently available model in that family.

feature, refactoring: sonnet @high
bug-fix: opus @xhigh
perf-issue: opus @xhigh
hillclimb: opus @xhigh
judgment and prose: sonnet @high
strongest judgment: opus @xhigh
how explorer: sonnet @high
how explainer: sonnet @high
why investigators: opus @xhigh
why synthesizer: opus @xhigh
reflect tooling: sonnet @high
reflect judgment, divergent, synthesizer: opus @xhigh
arena runners: sonnet @high, opus @xhigh
arena cross-judge pool: opus @xhigh
swarm workers: opus @xhigh
architect runners: opus @xhigh
interrogate reviewers: opus @xhigh

default effort: high
session hook: on
panel vendors: any

## Delegation

Default to one agent. The main agent owns exploration, planning, implementation, and verification. Delegate only independent workstreams that can progress with limited coordination, or a justified independent review. A role line or panel pool does not itself justify delegation. Use one independent reviewer by default; the reviewer must not be the author. Preserve explicit user and project review requirements. Do not create nested delegation without a separately justified subdivision.

Sonnet at high owns ordinary implementation, refactoring, exploration, explanation, and prose. Opus at xhigh owns difficult bugs, performance analysis, concurrency, security, architecture, synthesis, independent review, and final quality decisions. Parallel swarm work and its verification use Opus at xhigh. Do not lower effort for these reviews or investigations. Use max only for a specific unresolved problem with a concrete reason to expect a benefit. Do not switch the owner to another model by spawning an unnecessary helper. If the host cannot switch the owner session, state that limitation instead of claiming the role sheet changed the running model.

## Bounded Haiku helpers

Use Haiku at low only for exact file, symbol, or configuration lookups with explicit search criteria. Return source paths and line references.

Use Haiku at medium only for deterministic transformations, exact text formatting or boilerplate edits, and extraction of specified facts from logs. The parent checks the output and any diff. Escalate work that needs interpretation to Sonnet, and consequential judgments to Opus.

Haiku does not replace a configured worker, investigator, panel member, reviewer, verification worker, or final decision maker. It must not perform root-cause analysis, architecture, security judgments, or final quality decisions. These helper exceptions still require the delegation gate above.
