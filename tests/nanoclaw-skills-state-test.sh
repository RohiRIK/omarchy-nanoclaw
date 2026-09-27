#!/usr/bin/env bash
# Test: provisioning state must be per (skill, agent) -- never a whole-record
# replace.
#
# A link that is on disk but missing from state is an ORPHAN: dispose refuses
# to remove it, so the user is stuck and has to use --force. The two ways the
# old code orphaned links were:
#
#   1. `sync --agents claude` after `sync --agents claude,codex` replaced the
#      record, silently forgetting codex.
#   2. `dispose --all` called save_state '{"skills":{}}', and save_state read
#      its JSON from stdin rather than $1, so with a non-pipe stdin the reset
#      wrote nothing at all -- dispose reported success while state kept
#      claiming links that were already gone.
#
# Runs against a throwaway HOME and a copy of the plugin; the real agent skills
# dirs and the real state/skills.json are never touched.
set -uo pipefail

REAL_PLUGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

PLUGIN="$SANDBOX/plugin"
mkdir -p "$PLUGIN"
cp -a "$REAL_PLUGIN/." "$PLUGIN/"

S="$PLUGIN/bin/nanoclaw-skills"
STATE="$PLUGIN/state/skills.json"
export HOME="$SANDBOX/home"
mkdir -p "$HOME"

mkdir -p "$HOME/.hermes/skills/demo"
printf -- '---\nname: demo\n---\n' >"$HOME/.hermes/skills/demo/SKILL.md"

CLAUDE_DIR="$HOME/.claude/skills"
CODEX_DIR="$HOME/.codex/skills"

RC=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; RC=1; }

agents_of() { # skill
  python3 -c '
import json,sys
print(" ".join(sorted(json.load(open(sys.argv[1])).get("skills",{}).get(sys.argv[2],[]))))' \
    "$STATE" "$1"
}

# --- 1. a narrower sync must not forget the wider set ------------------------
"$S" sync --agents claude,codex >/dev/null
if [[ -L $CLAUDE_DIR/demo && -L $CODEX_DIR/demo ]]; then
  ok "sync created links for both agents"
else
  bad "sync did not create both links"; exit 1
fi

"$S" sync --agents claude >/dev/null
got="$(agents_of demo)"
if [[ $got == "claude codex" ]]; then
  ok "sync --agents claude kept the codex record (got: $got)"
else
  bad "sync --agents claude ORPHANED the codex link -- record is now '$got'"
fi

# --- 2. dispose for one agent must leave the other's record intact ----------
"$S" dispose --agents claude --all >/dev/null
got="$(agents_of demo)"
if [[ ! -e $CLAUDE_DIR/demo && ! -L $CLAUDE_DIR/demo ]]; then
  ok "dispose --agents claude --all removed the claude link"
else
  bad "dispose left the claude link behind"
fi
if [[ $got == "codex" ]]; then
  ok "dispose --agents claude kept the codex record (got: $got)"
else
  bad "dispose --agents claude forgot codex -- record is now '$got'"
fi

# And the surviving record must still be usable: dispose without --force.
out="$("$S" dispose demo --agents codex 2>&1)"
if [[ ! -e $CODEX_DIR/demo && ! -L $CODEX_DIR/demo ]]; then
  ok "the codex link was still disposable without --force: $out"
else
  bad "codex link is an orphan -- needs --force to remove: $out"
fi
if [[ -z $(agents_of demo) ]]; then
  ok "state entry is gone once its last agent is disposed"
else
  bad "stale state entry left behind: '$(agents_of demo)'"
fi

# --- 3. dispose --all with no --agents must actually clear state ------------
# The save_state bug: the reset was a silent no-op, so state kept claiming
# links that had already been removed.
"$S" sync --agents claude,codex >/dev/null
"$S" dispose --all >/dev/null
remaining="$(python3 -c '
import json,sys; print(len(json.load(open(sys.argv[1])).get("skills",{})))' "$STATE")"
if [[ $remaining == "0" ]]; then
  ok "dispose --all cleared the state file"
else
  bad "dispose --all left $remaining stale state entries -- reset was a no-op"
fi
if [[ ! -L $CLAUDE_DIR/demo && ! -L $CODEX_DIR/demo ]]; then
  ok "dispose --all removed every agent's link"
else
  bad "dispose --all left links behind"
fi

# --- 4. sync after a full dispose still works (state file was not corrupted) -
out="$("$S" sync --agents claude 2>&1)"
if [[ -L $CLAUDE_DIR/demo ]]; then
  ok "re-sync after dispose --all works: $out"
else
  bad "re-sync after dispose --all failed: $out"
fi

echo
if [[ $RC -eq 0 ]]; then echo "ALL ASSERTIONS PASSED"; else echo "ASSERTION FAILURES"; fi
exit $RC
