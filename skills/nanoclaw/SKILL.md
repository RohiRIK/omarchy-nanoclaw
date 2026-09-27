---
name: nanoclaw
description: >
  Use when operating, troubleshooting, or changing NanoClaw on this machine:
  service health, agents (agent groups), templates, channels (Telegram,
  WhatsApp, Slack…), providers, sessions and containers, scheduled tasks,
  approvals, disposable agents, or the Omarchy NanoClaw plugin (bar panel,
  menu, default agent). Triggers: nanoclaw, ncl, claw, agent group, family
  assistant, disposable agent, credential gateway, onecli. Runs on the host;
  never enters a NanoClaw container.
---

# Managing NanoClaw

NanoClaw is a self-hosted assistant: a host service routes messages from
channels to agents, and each agent session runs in its own Docker container.

| What | Where |
| --- | --- |
| Checkout | `~/nanoclaw` (upgrade with its `/update-nanoclaw` skill, not `git pull`) |
| Service | systemd **user** unit `nanoclaw-v2-<slug>`; slug = first 8 hex of sha1 of the checkout path |
| Central DB | `~/nanoclaw/data/v2.db` (SQLite; read-only for inspection) |
| Agents | `~/nanoclaw/groups/<folder>/` (CLAUDE.md, skills, memory) |
| Omarchy plugin | `~/.config/omarchy/plugins/rohirik.nanoclaw` (unofficial; `$PLUG` below) |
| Setup log | `~/nanoclaw/logs/setup.log`, per step in `logs/setup-steps/` |

## First look

```bash
PLUG=~/.config/omarchy/plugins/rohirik.nanoclaw
$PLUG/bin/nanoclaw-dash | jq .   # service, agents, containers, approvals, channels
nanoclaw-ctl service status
nanoclaw-ctl service logs
```

`nanoclaw-dash` works while the service is down. `ncl` needs the service
running (it talks to `data/ncl.sock`) and boots Node, so each call takes a
few seconds.

## Doing things — prefer these, in this order

1. **`nanoclaw-ctl`** (the plugin's wrapper; `$PLUG/bin/nanoclaw-ctl`, or on PATH
   if the user ran `nanoclaw-integrate install commands`). `nanoclaw-ctl --help`.
   - `setup` resume/repair the guided setup · `service start|stop|restart|status|logs`
   - `agents` · `main [folder]` make an agent answer the terminal chat ·
     `agent-restart <folder>` · `agent-delete <folder>` (user must type the name; backed up first — never pipe the confirmation for them)
   - `templates` · `template-create <category/name> [name]`
   - `disposable` throwaway agent, removed on exit
   - `channel <name>` · `provider codex|opencode|ollama-provider` (run NanoClaw's `/add-*` skill)
   - `tasks` · `approvals` · `migrate-openclaw` · `customize`
   - `clean` leftovers (asks first; orphaned folders archived to `~/.local/share/rohirik.nanoclaw/backups/`)
2. **`ncl <resource> <verb>`** for anything finer: resources are groups,
   messaging-groups, wirings, users, roles, members, destinations, policies,
   user-dms, dropped-messages, approvals, sessions, tasks. Add `--json` to parse.
   Examples: `ncl groups restart --id <id> --rebuild`,
   `ncl wirings update --id <id> --engage-pattern .`.
3. **NanoClaw's own Claude Code skills** in `~/nanoclaw/.claude/skills`
   (`/add-telegram`, `/manage-channels`, `/manage-mounts`, `/customize`,
   `/debug`, `/update-nanoclaw`, …). They load when Claude Code runs inside
   `~/nanoclaw`, which is what `nanoclaw-ctl channel|provider|customize` do.
   They are interactive; hand them to the user in a terminal rather than
   running them headless.

## How the terminal chat is routed

The terminal chat is the `cli/local` messaging group. Every agent wired to it
with a matching engage pattern answers each message. Setup wires its scratch
"Terminal Agent", then deletes it once a template agent exists **without**
wiring the template agent — run `nanoclaw-ctl main` when Chat gets no reply.

Disposable sessions mute the other `cli/local` wirings with pattern `(?!)`
and record the originals in the plugin's `state/disposable-muted.tsv`; any
later `nanoclaw-ctl` call restores them if a session crashed. Never hand-edit
that file while a disposable session is open.

## Containers

Agent containers are named `ncl-<slug>-<session>` and labelled
`nanoclaw-install=<slug>`, `nanoclaw-group=<agent id>`,
`nanoclaw-group-folder=<folder>`, `nanoclaw-session=<session id>`. Filter on
the labels, not the names. NanoClaw owns their lifecycle: restart an agent
with `nanoclaw-ctl agent-restart`, don't `docker stop` its containers.
`nanoclaw-runner bench` uses its own `ncl-bench-*` containers only.

## Credentials

The OneCLI credential gateway (its own Docker containers) holds provider
credentials; agents never see raw keys. Don't write API keys into `.env` or a
group folder — re-run `nanoclaw-ctl setup` or the relevant `/add-*` skill.

## Host-agent skill provisioning (separate concern)

`nanoclaw-skills` links Omarchy's stock skills (and optionally personal ones)
into host agents' skill dirs as symlinks: `list`, `status`, `sync`,
`dispose --all`. It never touches NanoClaw's containers.

Container access (what an agent may mount or reach) is NanoClaw's own
business: use its `/manage-mounts` skill, not anything in this plugin.

## Desktop integration

`$PLUG/bin/nanoclaw-integrate install|remove|status [menu|agent|app|commands|skill]`
adds or removes the optional menu entries, default-agent routing, app entry,
PATH commands and this skill. It asks before each part and edits user files
only between `rohirik.nanoclaw` marker lines. Don't run it with `--yes` on the
user's behalf.
