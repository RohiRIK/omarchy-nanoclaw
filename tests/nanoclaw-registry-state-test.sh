#!/usr/bin/env bash
# Skill provisioning state-integrity test.
#
# A truncated or wrong-shaped state/skills.json must be reported and refused:
# no Python traceback, no provisioning claimed while nothing was written, and
# nanoclaw-status must fail rather than report a healthy host.
#
# Runs against a throwaway copy of the plugin in a temp HOME. The real
# ~/.config/omarchy state is never touched.

set -uo pipefail

PLUGIN_SRC="${PLUGIN_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PASS=0
FAIL=0

ok()   { printf '  ok   %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  FAIL %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (want '$3', got '$2')"; fi; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export HOME="$T/home"
mkdir -p "$HOME"
cp -r "$PLUGIN_SRC" "$T/plugin"
P="$T/plugin/bin"

# A fresh plugin copy per case, so one case's state file cannot leak into the
# next. Re-copied rather than reset in place: the whole point of these tests is
# that the state file starts absent.
reset_plugin() {
  find "$T/plugin/state" -name '*.json' -delete 2>/dev/null
}
put_state() { # relpath json
  mkdir -p "$(dirname "$T/plugin/state/$1")"
  printf '%s' "$2" >"$T/plugin/state/$1"
}

echo
echo "== skills: corrupt state is reported and refused =="

for shape in '{"skills":' 'nope' '[]' '42'; do
  reset_plugin
  put_state skills.json "$shape"
  out="$("$P/nanoclaw-skills" state 2>&1)"; rc=$?
  label="$(printf '%q' "$shape")"
  if [[ $rc -eq 0 ]]; then bad "skills state $label -> exit 0, expected 3"; else ok "skills state $label -> exit $rc"; fi
  if grep -q Traceback <<<"$out"; then bad "skills state $label leaked a traceback"; else ok "skills state $label has no traceback"; fi
done

reset_plugin
put_state skills.json 'broken'
# Use a single harmless skill name in the sandbox HOME only.
out="$("$P/nanoclaw-skills" sync --agents claude 2>&1)"; rc=$?
if [[ $rc -eq 0 ]]; then bad "sync on corrupt skills state -> exit 0, expected refusal"; else ok "sync refuses on corrupt state (exit $rc)"; fi
if grep -q 'Provisioned' <<<"$out"; then bad "sync falsely reported provisioning"; else ok "sync does not claim to have provisioned"; fi
if [[ -d "$HOME/.claude/skills" ]] && [[ -n "$(ls -A "$HOME/.claude/skills" 2>/dev/null)" ]]; then
  bad "sync created links despite refusing"
else
  ok "sync created no links"
fi


echo "== status: corrupt skills state is a FAIL, not silence =="

reset_plugin
put_state skills.json 'broken'
json="$("$P/nanoclaw-status" --json 2>/dev/null)"
msgs="$(python3 -c '
import json,sys
d=json.loads(sys.argv[1])
print("\n".join(c["message"] for c in d["checks"] if c["level"]=="fail"))' "$json")"
if grep -q 'Skill provisioning state is corrupt' <<<"$msgs"; then ok "status names the corrupt skills state"; else bad "status did not report it"; fi
if "$P/nanoclaw-status" --preflight >/dev/null 2>&1; then bad "preflight passed despite corrupt state"; else ok "preflight fails on corrupt state"; fi

echo
echo "== status: clean state is still healthy =="

reset_plugin
put_state skills.json '{"skills": {}}'
json="$("$P/nanoclaw-status" --json 2>/dev/null)"
fails="$(python3 -c '
import json,sys
print(json.loads(sys.argv[1])["summary"]["fail"])' "$json")"
check "no fails with clean state" "$fails" "0"

echo
if [[ $FAIL -eq 0 ]]; then
  printf 'ALL ASSERTIONS PASSED   (%d/%d)\n' "$PASS" "$PASS"
  exit 0
fi
printf 'ASSERTION FAILURES: %d failed, %d passed\n' "$FAIL" "$PASS"
exit 1
