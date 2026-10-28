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

For the shared Claude routing policy, apply the [Claude preset](#apply-the-shared-claude-preset) after installing the plugin. Plugin installation and updates do not apply this preset automatically.

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

## Check delegation behavior locally

Run the ordinary-work and required-review cases after changing delegation instructions:

```shell
bun tools/check-delegation.mjs --live --output /tmp/pstack-delegation
```

Without `--live`, the command prints usage and makes no model calls. Use `--runtime claude` or `--runtime codex` for one host, and `--scenario ordinary` or `--scenario required-review` for one case. `CLAUDE_BIN` and `CODEX_BIN` select the installed executables. The candidates use Sonnet at high and Sol at high respectively; reviewers follow the runtime's model sheet.

Each host changes the same four-file CLI in disposable projects. Ordinary work must use no helper. A project with an explicit review requirement must invoke one separate read-only reviewer. The runner checks resulting CLI behavior, workflow loading, actual delegation, and reviewer completion. Codex's short event stream can omit spawn calls, so the runner also reads its isolated native session records. A blocked review is not counted as a pass. Inspect the transcript for the reviewer's read-only work and findings before accepting a result as independent verification.

Claude loads this checkout with its user plugin settings disabled. Codex installs this checkout in a private temporary home, reuses the existing login through a temporary link, and copies the model-routing section and the fork's existing hook trust. Temporary homes and project files are removed after each case; reports and transcripts stay in the output directory. Global installations are unchanged. A changed hook that is not already trusted must be reviewed before running these cases.

These are local model-backed smoke checks. They run only when requested and are separate from the offline Bun suite.

## Apply the shared Claude preset

The checked-in [model sheet](../presets/claude/pstack-models.md) is the portable source for this fork's Claude routing policy. The [settings overlay](../presets/claude/settings-overlay.json) sets new sessions to Sonnet at high. These files contain no login data or machine paths.

| Work | Model and effort |
| --- | --- |
| Ordinary implementation, refactoring, exploration, explanation, and prose | Sonnet at high |
| Difficult bugs, performance, architecture, synthesis, independent review, and swarm verification | Opus at xhigh |
| Exact file, symbol, or configuration lookups | Haiku at low |
| Specified deterministic transformations, formatting, and fact extraction | Haiku at medium |

Haiku appears only in the bounded-helper policy. It does not fill a worker, investigator, reviewer, verification, or panel role. Start with one agent; a routing entry does not justify delegation.

Use a Claude Code version and account whose model catalog supports these aliases and effort levels. Live probes on Claude Code 2.1.312 resolved Sonnet, Opus, and Haiku to their 5.5 models and passed all four model/effort pairs above. Native child metadata and per-turn request records confirmed the effort, and response records confirmed the model. These were routing checks, not a relative quality benchmark. Aliases can resolve to newer models later.

Run the following from a clone of this repository. Back up the existing model sheet and settings first.

On macOS or Linux:

```sh
claude_config="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
mkdir -p "$claude_config"
cp presets/claude/pstack-models.md "$claude_config/pstack-models.md"
printf '@%s/pstack-models.md\n' "$claude_config"
```

On Windows PowerShell:

```powershell
$claudeConfig = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
New-Item -ItemType Directory -Force -Path $claudeConfig | Out-Null
Copy-Item presets/claude/pstack-models.md (Join-Path $claudeConfig 'pstack-models.md')
"@$claudeConfig/pstack-models.md"
```

Add the printed `@` line to `CLAUDE.md` in that config directory if it does not already include this sheet. Preserve the existing instructions. Merge the two keys from `settings-overlay.json` into that directory's `settings.json`; do not replace the settings file with the overlay. Other settings and plugin enablement stay machine-specific.

Start a new session. Confirm its default model is Sonnet at high and that the model sheet is loaded. A project override or command-line model/effort flag can take precedence, so check those when a machine differs. The role sheet selects models for delegated work; it does not switch the owner session's running model automatically. A coupled hard task needs the owner's model changed through the host's controls, rather than an unnecessary helper.

To keep machines aligned, update the clone and reapply these two preset files when this policy changes. Codex keeps its separate model sheet.
