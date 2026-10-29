# Use this fork on Claude Code and Codex

This fork keeps pstack's shared skills and native packaging for both runtimes. It changes the delegation default and adds a Claude Code Mods band. Original licenses and notices remain in the repository.

## Install

The plugin is named `pstack` and its marketplace is `wtigero`, so the installed identifier is `pstack@wtigero`. Remove an older distribution before enabling this one. All distributions use the same `pstack` skill namespace.

On Claude Code 2.1.311 or later, run:

```text
/plugin marketplace add wtigero/pstack-claude
/plugin install pstack@wtigero
```

On Codex, run:

```shell
codex plugin marketplace add wtigero/pstack-claude
codex plugin add pstack@wtigero
```

Restart the host after installation. On Codex, trust the session hook through `/hooks`. Keep your existing runtime-specific model sheet. Claude models belong in the Claude sheet, and Codex models belong in the Codex sheet. This fork does not replace your global instructions or model settings.

Apply the [shared presets](#apply-the-shared-presets) after installing the plugin. Plugin installation and updates do not apply presets automatically.

## Migrate an existing installation

Keep your model sheets and global instructions. Back up the runtime settings before changing plugin registrations. If `pstack@pstack-wtigero`, `pstack@pstack-claude`, or `pstack@pstack` is installed, uninstall it and remove its marketplace before running the install commands above. Run only the commands for entries that your plugin list reports.

On Claude Code:

```shell
claude plugin uninstall pstack@pstack-wtigero --scope user --keep-data
claude plugin marketplace remove pstack-wtigero --scope user
claude plugin uninstall pstack@pstack-claude --scope user --keep-data
claude plugin marketplace remove pstack-claude --scope user
claude plugin uninstall pstack@pstack --scope user --keep-data
claude plugin marketplace remove pstack --scope user
```

On Codex:

```shell
codex plugin remove pstack@pstack-wtigero
codex plugin marketplace remove pstack-wtigero
codex plugin remove pstack@pstack-claude
codex plugin marketplace remove pstack-claude
codex plugin remove pstack@pstack
codex plugin marketplace remove pstack
```

Preserve unrelated plugins and settings. Check project and local overrides for older pstack registrations too. After installing `pstack@wtigero`, start a new session and confirm that only this distribution supplies pstack skills and hooks. Codex stores hook trust by installed plugin identifier, so review and trust the new entry through `/hooks`. Remove obsolete pstack hook-state entries after the new hook works. Do not copy a trust hash without checking that the hook content is unchanged.

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

Each host changes the same four-file CLI in disposable projects. Ordinary work must use no helper. A project with an explicit review requirement must invoke one separate read-only reviewer. The runner checks resulting CLI behavior, workflow loading, actual delegation, and reviewer completion. Codex's short event stream can omit spawn calls, so the runner also reads its isolated native session records. A blocked review is not counted as a pass. The report separates `delegationPassed` from `review.status`. A completed child and a read-only brief leave the review `unverified`; an implementer, a file-mutation tool, or nested delegation rejects the review. Native evidence retains the brief, tool names, and applied model/effort context without copying tool arguments or hidden outputs. Shell tool names alone cannot prove that no files changed. Inspect the transcript and findings independently before accepting the review.

Exit 0 means the automatic checks passed. Exit 2 means the fixture and delegation checks passed but independent transcript inspection is still required. Exit 1 means a failed check or rejected/incomplete review. Required-review cases never become an automatic pass from prompt wording or child completion.

Claude loads this checkout with its user plugin settings disabled. Codex installs this checkout in a private temporary home, reuses the existing login through a temporary link, and copies the model-routing section and the fork's existing hook trust. Temporary homes and project files are removed after each case; reports and transcripts stay in the output directory. Global installations are unchanged. A changed hook that is not already trusted must be reviewed before running these cases.

These are local model-backed smoke checks. They run only when requested and are separate from the offline Bun suite.

## Apply the shared presets

The checked-in sheets in [presets/claude](../presets/claude/pstack-models.md) and [presets/codex](../presets/codex/pstack-models.md) define the shared routing policies. The [Claude settings overlay](../presets/claude/settings-overlay.json) sets new Claude sessions to Sonnet at high. The Codex preset sets role routing; it preserves the session model and effort in Codex's configuration. A role sheet does not change an owner session that is already running.

Run from a clone of this repository with Node.js installed. Preview both runtimes first:

```shell
node tools/apply-preset.mjs --runtime all
```

Apply the previewed preset inputs:

```shell
node tools/apply-preset.mjs --runtime all --apply
```

Use `--runtime claude` or `--runtime codex` for one host. For an explicit directory, use `--runtime claude --config-dir "/path with spaces"`. Without that option, Claude uses `CLAUDE_CONFIG_DIR` or its default user config directory; Codex uses `CODEX_HOME` or its default user home. The same Node command works in macOS/Linux shells and Windows PowerShell.

Preview lists the target files and owned fields without printing existing settings or secrets. It creates no directories. Apply backs up existing changed files under that runtime's `.pstack-backups` directory with private permissions on POSIX systems, then writes only changed files. Windows uses the account directory's inherited access controls. All inputs are planned before any write. Invalid JSON, malformed managed markers, dangling symlinks, or overlapping runtime-owned paths abort planning. Ownership checks include unchanged files and resolved directory aliases. Repeating the same apply produces no changes or new backups. A partial write can be retried using the existing state; backups remain available for recovery.

The applicator updates recognized model rows and preserves custom sheet prose. Shared policy lives in a marked block. An exact unmarked canonical preset, including the Claude preset copied by version 0.9.109, moves into that block without a second policy copy. Unrecognized custom prose stays user-owned outside the block. Codex instructions receive one marked preset block; legacy model rows under the pstack routing heading move into that block, while other instructions and notes remain. Custom instructions outside managed blocks stay user-owned and can override the preset. Review those overrides when machines differ. Do not hand-edit managed blocks; update the preset source and reapply it.

Claude gets one relative `@pstack-models.md` import beside `CLAUDE.md`, so config paths containing spaces work. Other imports remain. Settings are deep-merged at the overlay's leaves; other model entries, fields, plugins, and permissions remain. No plugin cache, login file, or Codex configuration is rewritten. Plugin registration and hook trust still use the native CLIs.

| Work | Claude Code | Codex |
| --- | --- | --- |
| Ordinary implementation, refactoring, exploration, explanation, and prose | Sonnet high | Sol high |
| Difficult bugs, performance, architecture, synthesis, independent review, and verification | Opus xhigh | Sol xhigh |
| Exact lookup helper | Haiku low | Luna low |
| Specified deterministic helper | Haiku medium | Luna medium |

Codex also keeps the sheet's bounded Terra exceptions. Helper exceptions require justified delegation. Astra is available only when the human explicitly requests it for the current task; it is never an automatic fallback or default panel choice.

Use a runtime and account that support the configured models and effort levels. Check the native catalog before dispatch. Sonnet 5.5 needs `modelSettings.claude-sonnet-5-5.effortLevel`; a top-level user `effortLevel` is insufficient. When an alias advances, verify the new canonical model and add its matching per-model entry rather than assuming the old key applies. See [Claude effort settings](https://code.claude.com/docs/en/model-config#adjust-effort-level).

Start a fresh session after applying. Check the loaded sheet and native settings. If a project override or CLI flag differs, report it. Do not claim a model or effort was applied from a self-report. The earlier Claude 2.1.312 probes confirmed the four Claude pairs through actual response and request metadata; those results are routing checks, not quality benchmarks or proof for another machine.

## Runtime preset support

| Runtime | Packaging | Shared preset in this fork |
| --- | --- | --- |
| Claude Code | Native plugin and Mods band | Claude sheet, relative import, settings overlay, and applicator |
| Codex | Native plugin and lifecycle hook | Codex sheet, managed instructions, and applicator |
| Pi | Native package and extension | Runtime setup with provider-specific model IDs; no portable preset claimed |
| GitHub Copilot CLI/app | Native plugin | Runtime setup against its available model enum; no portable preset claimed |
| Muse | Native plugin | Runtime setup against its model catalog; no portable preset claimed |
| opencode and Gemini CLI | Shared skills installation | Runtime-specific instructions and setup; no live preset verification claimed |
| Prime Agent | Shared skills installation | No documented portable sheet path or verified preset |

The shared skills do not make model IDs or effort controls interchangeable. Add another preset only after checking that runtime's catalog, configuration precedence, and native behavior. Keep its support level explicit.
