# Use this fork on Claude Code and Codex

This fork keeps pstack's shared skills and native packaging for both runtimes. It changes the delegation default and adds a Claude Code Mods band. Original licenses and notices remain in the repository.

## Install

Disable an existing pstack installation before enabling this fork. Both use the `pstack` skill namespace. The distinct marketplace name identifies this distribution, but does not let both implementations of `/pstack:how` coexist.

On Claude Code 2.1.311 or later, run:

```text
/plugin marketplace add wtigero/pstack-claude
/plugin install pstack@pstack-wtigero
```

On Codex, run:

```shell
codex plugin marketplace add wtigero/pstack-claude
codex plugin add pstack@pstack-wtigero
```

Restart the host after installation. On Codex, trust the session hook through `/hooks`. Keep your existing runtime-specific model sheet. Claude models belong in the Claude sheet, and Codex models belong in the Codex sheet. This fork does not replace your global instructions or model settings.

For local Claude development, load the checkout for one session:

```shell
claude --plugin-dir ./plugins/pstack
```

## Use the session band

The band displays session cost when the host provides it and the number of running helpers. The workflow label is the last pstack skill expanded in this session. Status stays on the left and workflow buttons sit on the right, wrapping when space is narrow. It does not certify verification or independent review.

Explain, Build, and Review place `/pstack:how`, `/pstack:poteto-mode`, and `/pstack:interrogate` in the prompt box. Existing draft text remains after the command. Check the draft and press Enter to run it. Buttons disappear while a turn is running. The band yields to host surveys and preserves other mods' output.

The band opens automatically when the host starts the session. Click Hide to collapse it, then Show pstack to restore it. Both buttons act locally without submitting a prompt or starting a model turn. These controls do not change the delegation policy or model routing.

The module uses Claude Code's Mods API. It makes no model or network calls and writes no preferences, transcripts, or ledgers itself. Cost is the host's session total, not a subscription invoice. The band is present only where the host renders `AbovePrompt`. Native tests exercise terminal and desktop element trees. The CLI layout also needs a real interactive check when it changes.

Codex loads its existing lifecycle hooks and shared skills. Its manifest does not load the Claude UI module.

## Apply delegation deliberately

The main agent owns the task by default. A second agent needs an independent workstream or justified independent review. A small edit stays with the main agent. Parallel investigation can split genuinely independent questions. A substantive correctness, security, or regression risk can justify one reviewer who did not author the change. Explicit project or user review gates remain required.

The policy is in [delegation.md](../plugins/pstack/skills/poteto-mode/references/delegation.md). Workflow entry points load it before dispatch. Model sheets select models after the delegation decision. Configuration is instruction-based routing, not a runtime ban on creating agents.

## Verify a change

Use Bun 1.4.4, matching upstream CI:

```shell
bun install --frozen-lockfile
bun tools/generate.mjs
bun tools/generate.mjs --check
bun test tests/
node tools/test-claude-band.mjs
claude plugin validate plugins/pstack
```

The band test command requires Claude Code 2.1.311 or later. It stages the actual manifest and hooks in a temporary directory, runs Claude's own test kit, and removes the directory. Staging keeps Claude's recursive test discovery from trying to execute the unrelated vendored Bun tests as Mods tests.

Keep upstream-derived edits in `tools/forks.json`, regenerate committed copies, and run the pinned sync dry runs before updating this fork. Do not edit installed plugin caches.
