#!/usr/bin/env bash
# Test: dispose/disable must remove ONLY the symlinks this plugin created.
#
# Everything runs against a throwaway HOME and a copy of the plugin, so the
# real ~/.claude/skills, ~/.hermes/skills and the real state/skills.json are
# never touched. HOME is redirected, and the plugin is copied so its state file
# writes land in the sandbox too.
set -uo pipefail

REAL_PLUGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

PLUGIN="$SANDBOX/plugin"
mkdir -p "$PLUGIN"
cp -a "$REAL_PLUGIN/." "$PLUGIN/"

S="$PLUGIN/bin/nanoclaw-skills"
export HOME="$SANDBOX/home"
mkdir -p "$HOME"

# Two discoverable skills in a personal source, plus a third that will vanish.
SRC="$HOME/.hermes/skills/demo"
mkdir -p "$SRC" "$HOME/.hermes/skills/other"
printf -- '---\nname: demo\n---\n' >"$SRC/SKILL.md"
printf -- '---\nname: other\n---\n' >"$HOME/.hermes/skills/other/SKILL.md"

AGENT_DIR="$HOME/.claude/skills"
RC=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; RC=1; }

# --- sync provisions both skills --------------------------------------------
out="$("$S" sync --agents claude 2>&1)"
if [[ -L $AGENT_DIR/demo && -L $AGENT_DIR/other ]]; then
  ok "sync created both links"
else
  bad "sync did not create links: $out"; exit 1
fi

# --- plant a symlink that is NOT ours ---------------------------------------
# A link on disk whose name matches a discoverable skill, pointing somewhere
# completely unrelated, and deliberately NOT recorded in our state. The old
# dispose matched on name alone and would have deleted it.
mkdir -p "$HOME/important"
printf 'user data\n' >"$HOME/important/SKILL.md"
rm -f "$AGENT_DIR/other"
ln -sfn "$HOME/important" "$AGENT_DIR/other"
python3 - "$PLUGIN/state/skills.json" <<'PY'
import json,sys
p=sys.argv[1]
d=json.load(open(p))
d["skills"].pop("other",None)   # make that link demonstrably not ours
json.dump(d,open(p,"w"),indent=2)
PY

# --- dispose --all: must remove `demo`, must NOT remove `other` ---------------
out="$("$S" dispose --agents claude --all 2>&1)"
if [[ ! -e $AGENT_DIR/demo && ! -L $AGENT_DIR/demo ]]; then
  ok "dispose --all removed our own link (demo)"
else
  bad "dispose --all left our own link behind: $out"
fi
if [[ -L $AGENT_DIR/other ]] && [[ $(readlink -f "$AGENT_DIR/other") == "$HOME/important" ]]; then
  ok "dispose --all preserved a symlink we did not create (other -> important)"
else
  bad "dispose --all DELETED a symlink we did not create -- ownership bug"
fi
if [[ -f $HOME/important/SKILL.md ]]; then
  ok "target of the preserved link is intact"
else
  bad "target of the preserved link was damaged"
fi

# --- re-sync, then dispose a single skill ------------------------------------
"$S" sync --agents claude >/dev/null 2>&1
# Plant a REAL directory shadowing a skill name: must never be removed.
rm -f "$AGENT_DIR/other"
mkdir -p "$AGENT_DIR/other"
printf 'a real user directory\n' >"$AGENT_DIR/other/SKILL.md"

out="$("$S" dispose other --agents claude 2>&1)"
if [[ -d $AGENT_DIR/other && ! -L $AGENT_DIR/other ]]; then
  ok "dispose <skill> never removed a real directory"
else
  bad "dispose <skill> DESTROYED a real user directory: $out"
fi

# --- --force: waives state, still spares real directories --------------------
rm -rf "$AGENT_DIR/other"
"$S" sync --agents claude >/dev/null 2>&1
rm -f "$AGENT_DIR/other"
ln -sfn "$HOME/important" "$AGENT_DIR/other"
out="$("$S" dispose other --agents claude --force 2>&1)"
if [[ ! -e $AGENT_DIR/other && ! -L $AGENT_DIR/other ]]; then
  ok "--force removed an unrecorded symlink (lost-state recovery)"
else
  bad "--force failed to remove an unrecorded symlink: $out"
fi

echo
if [[ $RC -eq 0 ]]; then echo "ALL ASSERTIONS PASSED"; else echo "ASSERTION FAILURES"; fi
exit $RC
