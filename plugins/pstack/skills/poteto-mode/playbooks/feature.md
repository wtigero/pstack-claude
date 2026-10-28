### Feature

**You own the design, implementation, and verification.** Apply the [delegation policy](../references/delegation.md) before involving another agent.

1. `how` over the affected subsystem.
2. `architect` to compare designs. Keep the comparison in the main agent unless independent candidates justify delegation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** Keep the main agent as the default. Justify any delegation under the shared policy.
4. Implement with the main agent by default. Delegate only a concrete independent workstream allowed by the delegation policy. Name its files, data shape, ownership, checks, and expected benefit. Use the configured feature model only after that decision. Use arena for genuinely competing approaches that justify independent candidates. When substantive correctness, security, or regression risk warrants independent review, use one reviewer who did not author the change. Keep explicit user or project review gates independent. **Give every file-writing delegate its own worktree** (spawn it with `isolation: "worktree"`, or hand it an exclusive branch), and do not write files or run a suite in a worktree a delegate still holds. On Claude Code, `isolation: "worktree"` branches from the remote default branch unless the `worktree.baseRef` setting is `"head"`. When the delegate builds on commits the default branch lacks, commit them, create its worktree with `git worktree add <path> -b <delegate-branch> HEAD`, and name that base commit in the brief. Fencing a file in the brief's prose is not a lock (**principle-separate-before-serializing-shared-state**). Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

Code-coupled work (one feature, one migration) stays with the main agent and its checkpoint. Delegate internally only after the blocking phase and when the shared policy justifies independent work. Parent-level fan-out is for independent artifacts that meet the same policy (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. When replacing a justified delegate, give its successor the complete current brief rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.
