# Agent delegation

Default to one agent. The main agent owns exploration, planning, implementation, and verification. Use direct tools and parallel tool calls for routine searches and checks.

Spawn only for concrete independent workstreams that can progress in parallel with limited coordination, or for independent review justified by substantive correctness, security, or regression risk or an explicit review requirement. Multiple files, a function boundary, a specialist role, an unfamiliar subsystem, or a pstack trigger alone do not justify delegation.

Before spawning, state the separate question or deliverable, context, ownership, and expected benefit. Start with one helper. Use more only for distinct independent workstreams, competing approaches, or review scopes. Do not nest delegation unless the parent explicitly assigns an independent subdivision. Parallel writers need isolated worktrees or exclusive branches and integration checks. Read-only exploration can share a checkout. The main agent checks the evidence and integrates the result.

Use one independent reviewer by default when review is warranted. The reviewer must not be the author. Preserve independent-review gates explicitly required by the user or project. Self-review and passing tests do not satisfy them. If a required reviewer cannot run, report the gate as blocked and continue only work that does not depend on it.

This policy takes precedence over automatic spawn, delegation, and panel instructions elsewhere in pstack, including how, why, architect, arena, feature, bug-fix, reflect, no-comments, and thermos. When delegation is not justified, perform their reasoning and checks sequentially in the main agent. Do not claim independent review or model diversity for a sequential pass. An explicit request for parallel candidates, a swarm, or a review panel supplies that scope, subject to the user's constraints.

Model-routing rows choose a model only after delegation is justified. A configured panel is a pool of available seats, not an instruction to fill them. Do not lower effort for independent review or complex investigation. Runtime-specific model sheets and user instructions take precedence over bundled model defaults.

Do not recommend or dispatch Astra or fable unless the human user explicitly requests that model for the current task. Availability, a panel entry, a prior task, or another agent does not authorize either model. A request for one does not authorize the other or change automatic defaults.
