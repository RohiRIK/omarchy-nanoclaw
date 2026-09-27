#!/usr/bin/env bash
# Test: disposable agents never leave your real agent muted or leftovers behind.
#
# Runs nanoclaw-ctl against a fake checkout: a real SQLite DB with NanoClaw's
# tables, a stub `ncl` that applies each command to that DB, and a stub chat
# session. Covers a clean exit, a closed terminal (SIGHUP), and a hard crash
# (SIGKILL) recovered by the next nanoclaw-ctl call. Also checks nanoclaw-dash
# reads the same DB.
set -uo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CTL="$PLUGIN_DIR/bin/nanoclaw-ctl"
RC=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; RC=1; }

TMP="$(mktemp -d)"
trap '[[ -n ${KEEP:-} ]] || rm -rf "$TMP"' EXIT
CO="$TMP/nanoclaw"
mkdir -p "$CO/bin" "$CO/data" "$CO/groups" "$TMP/state"
touch "$CO/nanoclaw.sh"
python3 -c "import socket; s=socket.socket(socket.AF_UNIX); s.bind('$CO/data/ncl.sock')"

python3 - "$CO/data/v2.db" <<'EOF'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.executescript("""
CREATE TABLE agent_groups (id TEXT PRIMARY KEY, name TEXT, folder TEXT UNIQUE, agent_provider TEXT, created_at TEXT);
CREATE TABLE messaging_groups (id TEXT PRIMARY KEY, channel_type TEXT, platform_id TEXT, name TEXT, created_at TEXT);
CREATE TABLE messaging_group_agents (id TEXT PRIMARY KEY, messaging_group_id TEXT, agent_group_id TEXT,
  engage_mode TEXT, engage_pattern TEXT, created_at TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, agent_group_id TEXT, status TEXT, container_status TEXT);
CREATE TABLE pending_approvals (approval_id TEXT PRIMARY KEY, agent_group_id TEXT, action TEXT, title TEXT,
  status TEXT, created_at TEXT);
INSERT INTO agent_groups VALUES ('ag-main', 'Terminal Agent', 'terminal-agent', 'claude', '1');
INSERT INTO messaging_groups VALUES ('mg-cli', 'cli', 'local', 'local', '1');
INSERT INTO messaging_group_agents VALUES ('w-main', 'mg-cli', 'ag-main', 'pattern', '^hey', '1');
INSERT INTO sessions VALUES ('s1', 'ag-main', 'active', 'running');
INSERT INTO pending_approvals VALUES ('ap1', 'ag-main', 'install_packages', 'Install jq', 'pending', '1');
""")
db.commit()
EOF

# Stub ncl: apply the handful of commands nanoclaw-ctl issues to the DB.
cat >"$CO/bin/ncl" <<'EOF'
#!/usr/bin/env python3
import sqlite3, sys, uuid, os
db = sqlite3.connect(os.path.join(os.path.dirname(__file__), "..", "data", "v2.db"))
a = sys.argv[1:]; res, verb = a[0], a[1]
opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith("--")}
if (res, verb) == ("groups", "create"):
    db.execute("INSERT INTO agent_groups VALUES (?,?,?,?,?)", ("ag-" + uuid.uuid4().hex[:6], opt["name"], opt["folder"], "claude", "2"))
elif (res, verb) == ("groups", "delete"):
    db.execute("DELETE FROM messaging_group_agents WHERE agent_group_id=?", (opt["id"],))
    db.execute("DELETE FROM agent_groups WHERE id=?", (opt["id"],))
elif (res, verb) == ("wirings", "update"):
    db.execute("UPDATE messaging_group_agents SET engage_pattern=? WHERE id=?", (opt["engage-pattern"], opt["id"]))
elif (res, verb) == ("wirings", "create"):
    ag = db.execute("SELECT id FROM agent_groups WHERE folder=?", (opt["agent-group"],)).fetchone()[0]
    db.execute("INSERT INTO messaging_group_agents VALUES (?,?,?,?,?,?)", ("w-" + uuid.uuid4().hex[:6], "mg-cli", ag, "pattern", opt["engage-pattern"], "2"))
elif (res, verb) == ("groups", "list"):
    for r in db.execute("SELECT folder FROM agent_groups"): print(r[0])
db.commit()
EOF
chmod +x "$CO/bin/ncl"

q() { python3 -c "import sqlite3,sys; print(*sqlite3.connect('$CO/data/v2.db').execute(sys.argv[1]).fetchone() or [''])" "$1"; }

# Stub chat session: records what the DB looks like mid-session, then ends
# the way $MODE says.
cat >"$TMP/agent" <<EOF
#!/usr/bin/env bash
python3 -c "import sqlite3; db=sqlite3.connect('$CO/data/v2.db'); print(db.execute(\"SELECT engage_pattern FROM messaging_group_agents WHERE id='w-main'\").fetchone()[0], db.execute(\"SELECT count(*) FROM messaging_group_agents mga JOIN agent_groups g ON g.id=mga.agent_group_id WHERE g.folder LIKE 'tmp-%'\").fetchone()[0])" >"$TMP/during"
case "\${MODE:-exit}" in
  hup)  kill -HUP \$PPID ;;
  kill) kill -KILL \$PPID ;;
esac
EOF
chmod +x "$TMP/agent"

run_ctl() { NANOCLAW_PATH="$CO" NANOCLAW_STATE_DIR="$TMP/state" NANOCLAW_AGENT_CMD="$TMP/agent" "$CTL" "$@" </dev/null >/dev/null 2>&1; }

check_clean() { # label
  local pat groups mutefile
  pat="$(q "SELECT engage_pattern FROM messaging_group_agents WHERE id='w-main'")"
  groups="$(q "SELECT count(*) FROM agent_groups WHERE folder LIKE 'tmp-%'")"
  [[ $pat == '^hey' ]] && pass "$1: main agent's exact pattern restored" || fail "$1: main pattern is '$pat'"
  [[ $groups == 0 ]] && pass "$1: disposable agent deleted" || fail "$1: $groups disposable agent(s) left"
  [[ ! -e $TMP/state/disposable-muted.tsv ]] && pass "$1: no mute record left" || fail "$1: mute record left behind"
}

MODE=exit run_ctl disposable
[[ $(cat "$TMP/during") == "(?!) 1" ]] && pass "during session: main muted, disposable wired" \
  || fail "during session: got '$(cat "$TMP/during")'"
check_clean "clean exit"

MODE=hup run_ctl disposable
check_clean "terminal closed (SIGHUP)"

MODE=kill run_ctl disposable
pat="$(q "SELECT engage_pattern FROM messaging_group_agents WHERE id='w-main'")"
[[ $pat == '(?!)' && -s $TMP/state/disposable-muted.tsv ]] && pass "hard crash: mute record survives on disk" \
  || fail "hard crash: expected a surviving record (pattern '$pat')"
# A decoy whose command line mentions a disposable session (like the wrapper
# shell of a killed session's terminal) must not block recovery.
(exec -a "bash -c nanoclaw-ctl disposable" sleep 30) &
DECOY=$!
run_ctl agents
kill "$DECOY" 2>/dev/null; wait "$DECOY" 2>/dev/null
[[ $(q "SELECT engage_pattern FROM messaging_group_agents WHERE id='w-main'") == '^hey' ]] \
  && pass "hard crash: next nanoclaw-ctl call unmutes the main agent (despite a look-alike process)" \
  || fail "hard crash: main agent still muted"
# The crashed session's agent is the one leftover a crash can leave; say so.
left="$(q "SELECT count(*) FROM agent_groups WHERE folder LIKE 'tmp-%'")"
echo "      (after the crash, $left disposable agent row remains; nanoclaw-ctl clean removes it)"

# --- dashboard reads the same DB ---------------------------------------------
dash="$(NANOCLAW_PATH="$CO" "$PLUGIN_DIR/bin/nanoclaw-dash")"
python3 - "$dash" <<'EOF' && pass "dash: agents, sessions and approvals read from the DB" || fail "dash: unexpected snapshot"
import json, sys
d = json.loads(sys.argv[1])
main = next(a for a in d["agents"] if a["folder"] == "terminal-agent")
assert main["activeSessions"] == 1 and main["channels"] == ["cli/local"], main
assert d["approvals"][0]["title"] == "Install jq" and d["approvals"][0]["agent"] == "Terminal Agent"
assert d["counts"]["approvals"] == 1
EOF

# --- clean: leftovers go, real agents stay ------------------------------------
python3 -c "
import sqlite3; db = sqlite3.connect('$CO/data/v2.db')
db.execute(\"DELETE FROM agent_groups WHERE folder LIKE 'tmp-%'\")
db.execute(\"INSERT INTO agent_groups VALUES ('ag-old', 'Disposable old', 'tmp-old', 'claude', '3')\")
db.commit()"
mkdir -p "$CO/groups/tmp-old" "$CO/groups/ghost" "$CO/data/v2-sessions/ag-ghost" "$CO/groups/terminal-agent/memory"
echo "remember me" >"$CO/groups/terminal-agent/memory/index.md"
echo "orphan data" >"$CO/groups/ghost/CLAUDE.md"
BK="$TMP/backups"
ctl_in() { local input="$1"; shift; printf '%s\n' "$input" | NANOCLAW_PATH="$CO" NANOCLAW_STATE_DIR="$TMP/state" NANOCLAW_BACKUP_DIR="$BK" "$CTL" "$@" >"$TMP/out" 2>&1; }

ctl_in n clean
[[ -d $CO/groups/ghost && $(q "SELECT count(*) FROM agent_groups WHERE folder='tmp-old'") == 1 ]] \
  && pass "clean: answering no changes nothing" || fail "clean: acted without confirmation"
grep -q "tmp-old" "$TMP/out" && grep -q "groups/ghost" "$TMP/out" && grep -q "v2-sessions/ag-ghost" "$TMP/out" \
  && pass "clean: preview lists the disposable agent and both orphaned folders" || fail "clean: preview incomplete: $(cat "$TMP/out")"
grep -q "terminal-agent" "$TMP/out" && fail "clean: listed a real agent" || pass "clean: real agent not listed"

ctl_in y clean
[[ $(q "SELECT count(*) FROM agent_groups WHERE folder='tmp-old'") == 0 && ! -d $CO/groups/tmp-old ]] \
  && pass "clean: stale disposable agent deleted" || fail "clean: stale disposable agent left"
[[ ! -d $CO/groups/ghost ]] && tar -tzf "$BK"/orphan-ghost-*.tar.gz 2>/dev/null | grep -q "ghost/CLAUDE.md" \
  && pass "clean: orphaned folder moved into a backup" || fail "clean: orphaned folder not backed up"
[[ $(cat "$CO/groups/terminal-agent/memory/index.md") == "remember me" && \
   $(q "SELECT count(*) FROM agent_groups WHERE folder='terminal-agent'") == 1 ]] \
  && pass "clean: real agent and its memory untouched" || fail "clean: real agent damaged"
ctl_in y clean; grep -q "Nothing to clean" "$TMP/out" && pass "clean: second run finds nothing" || fail "clean: not idempotent"

# --- agent-delete: exact name to confirm, backup first ------------------------
ctl_in y agent-delete terminal-agent
[[ $(q "SELECT count(*) FROM agent_groups WHERE folder='terminal-agent'") == 1 ]] \
  && pass "agent-delete: a bare 'y' does not delete" || fail "agent-delete: 'y' deleted the agent"
ctl_in terminal-agent agent-delete terminal-agent
[[ $(q "SELECT count(*) FROM agent_groups WHERE folder='terminal-agent'") == 0 ]] \
  && tar -tzf "$BK"/agent-terminal-agent-*.tar.gz 2>/dev/null | grep -q "memory/index.md" \
  && pass "agent-delete: typing the name deletes, memory backed up first" || fail "agent-delete: no backup or not deleted"

# --- argument validation -----------------------------------------------------
NANOCLAW_PATH="$CO" "$CTL" template-install ../../etc </dev/null >/dev/null 2>&1 \
  && fail "template ref with ../ accepted" || pass "template ref with ../ rejected"
NANOCLAW_PATH="$CO" "$CTL" channel 'x;rm' </dev/null >/dev/null 2>&1 \
  && fail "odd channel name accepted" || pass "odd channel name rejected"

echo
[[ $RC -eq 0 ]] && echo "ALL ASSERTIONS PASSED" || echo "ASSERTION FAILURES"
exit $RC
