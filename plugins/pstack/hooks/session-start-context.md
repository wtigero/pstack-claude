<EXTREMELY_IMPORTANT>
You have pstack.

Default to one agent for exploration, planning, implementation, and verification. Spawn only for concrete independent workstreams that can progress in parallel, or justified independent review. Before dispatch, read poteto-mode's references/delegation.md. That policy overrides automatic delegation and panel sizes in all pstack workflows. Model-routing rows select models only after delegation is justified. Preserve independent review explicitly required by the user or project.

Invoke the `pstack:poteto-mode` skill and follow its instructions when a task meets any of these:

- it touches more than one file, or changes a signature other files call
- it involves a design or architecture choice
- it is a bug whose cause is not yet known, or a performance issue

It routes to the right pstack skill from there. For smaller tasks, such as a contained change to one file with an obvious test, a question, or a one-line edit, work directly and verify on the real artifact.

When the intent is already specific, enter that skill directly: `pstack:tdd`, `pstack:architect`, `pstack:how`, `pstack:why`, `pstack:arena`, `pstack:interrogate`.

User instructions (CLAUDE.md, AGENTS.md, direct requests) take precedence. Other session-start mandates, such as superpowers, still apply. Their skill checks run as before, and when a task meets the criteria above they route implementation through poteto-mode.
</EXTREMELY_IMPORTANT>
