# Host operations and desktop integration

## Prerequisites

Run on the host with the user's NanoClaw checkout (normally `~/nanoclaw`) and Omarchy plugin (normally `~/.config/omarchy/plugins/rohirik.nanoclaw`). These paths are defaults, not proof of the live install. Inspect native metadata. Never enter a container or inspect/edit its live workspace.

## Steps

1. Inspect health through supported wrappers:

```sh
PLUG="$HOME/.config/omarchy/plugins/rohirik.nanoclaw"
"$PLUG/bin/nanoclaw-dash"
nanoclaw-ctl service status
nanoclaw-ctl service logs
```

The dashboard can work while the service is down. `ncl` needs the host service/socket and its Node/pnpm dependencies on PATH. The usual user unit is `nanoclaw-v2-<slug>`, with slug derived from the checkout path; verify rather than guess. The central metadata DB is normally `data/v2.db`; prefer native APIs, and do not write DB rows directly. Setup logs live under `logs/setup.log` and `logs/setup-steps/`.

2. Discover the installed command interface before using version-sensitive flags:

```sh
nanoclaw-ctl --help
ncl groups help
ncl sessions help
ncl tasks help
```

Prefer `nanoclaw-ctl` for guided setup/health/lifecycle, then `ncl RESOURCE VERB --json` for bounded metadata operations. Native Claude Code setup skills under the checkout's `.claude/skills/` include `/add-telegram`, `/manage-channels`, `/manage-mounts`, `/customize`, `/debug` and `/update-nanoclaw`. Upgrade through the supported update workflow, not an unreviewed `git pull`. Interactive account/setup flows belong in the user's terminal, not a headless approval bypass.

3. Route the required operation, preserving approval gates:

- `setup`; `service start|stop|restart|status|logs`.
- `agents`; `main [folder]`; `agent-restart <folder>`.
- `templates`; `template-create <category/name> [name]`; `disposable`.
- `channel <name>`; `provider codex|opencode|ollama-provider`; `tasks`; `approvals`; `migrate-openclaw`; `customize`.
- `agent-delete` and `clean` are destructive/retirement operations: get scoped approval, preserve output, and never pipe typed confirmations. Cleanup normally archives orphaned folders under the plugin's backup directory; inspect the current helper.

4. Diagnose terminal routing without guessing: terminal chat uses the `cli/local` messaging group. All agents with matching wirings can answer. Setup can retire its scratch agent without wiring the replacement. Inspect `ncl messaging-groups`, `wirings` and group metadata; `nanoclaw-ctl main` selects the terminal agent. Do not add a public/terminal wiring just to run a background native task. Disposable mode temporarily mutes other terminal wirings with `(?!)` and records originals in `state/disposable-muted.tsv`; the wrapper restores them after a crash. Do not hand-edit this state while a disposable session is open.

5. Use native container lifecycle. Containers carry `nanoclaw-install`, `nanoclaw-group`, `nanoclaw-group-folder` and `nanoclaw-session` labels. Filter metadata by labels, not guessed names. Restart only the intended group via `ncl groups restart --id GROUP_ID` or the wrapper; do not `docker stop`, enter, or mutate its filesystem. Read-only host metadata inspection is not container execution. The runner bench uses separate `ncl-bench-*` containers.

6. Preserve OneCLI isolation. Credentials belong to the credential gateway; reference their names, never read/copy raw keys into prompts, `.env`, project fixtures or group folders. Repair account setup through the supported setup/provider workflow.

7. Keep host skill links separate from container provisioning. `nanoclaw-skills list|status|sync` and `dispose --all` manage recorded host-agent symlinks, not live container workspaces. A symlink is not proof the skill loaded or its workflow passed. Do not sync/dispose another profile's skills without authorization.

8. Desktop integration uses `nanoclaw-integrate install|remove|status [menu|agent|app|commands|skill]` and edits user files between plugin markers. Do not waive its approval prompts on the user's behalf. Load the host desktop skill when changing desktop configuration.

## Exit Criteria

The exact intended native target was read back; health/routing/lifecycle claims have real evidence. Credentials and live workspaces remain untouched, and no unrelated service, wiring or profile was changed.
