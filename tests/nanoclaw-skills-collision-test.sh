#!/usr/bin/env bash
# Test: sync and enable never replace a skill link, file or folder that is not
# the plugin's, never record one as plugin-owned, so dispose/disable cannot
# remove it later. Runs in a throwaway HOME against a copy of the plugin.
set -uo pipefail

REAL_PLUGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
PLUGIN="$SANDBOX/plugin"
mkdir -p "$PLUGIN"
cp -a "$REAL_PLUGIN/." "$PLUGIN/"
rm -f "$PLUGIN/state/skills.json"
S="$PLUGIN/bin/nanoclaw-skills"
export HOME="$SANDBOX/home"

# A discoverable personal skill "demo", and the user's own, unrelated "demo"
# already linked into Claude's skills dir under the same name.
mkdir -p "$HOME/.hermes/skills/demo" "$HOME/mine/demo" "$HOME/.claude/skills" "$HOME/.codex/skills"
printf -- '---\nname: demo\n---\n' >"$HOME/.hermes/skills/demo/SKILL.md"
printf 'my own demo\n' >"$HOME/mine/demo/SKILL.md"
ln -s "$HOME/mine/demo" "$HOME/.claude/skills/demo"

RC=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; RC=1; }
recorded() { python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))["skills"]
print(" ".join(sorted(d.get("demo", []))))' "$PLUGIN/state/skills.json" 2>/dev/null; }

"$S" sync --scope personal --agents claude,codex >/dev/null 2>&1
[[ $(readlink "$HOME/.claude/skills/demo") == "$HOME/mine/demo" ]] && ok "sync kept the user's own link" || bad "sync replaced the user's link"
[[ -L $HOME/.codex/skills/demo ]] && ok "sync still linked where nothing was in the way" || bad "sync skipped a free slot"
[[ $(recorded) == "codex" ]] && ok "only the link sync created is recorded (got: $(recorded))" || bad "recorded: '$(recorded)'"

"$S" enable demo --agents claude >/dev/null 2>&1
[[ $(readlink "$HOME/.claude/skills/demo") == "$HOME/mine/demo" ]] && ok "enable kept the user's own link" || bad "enable replaced the user's link"
[[ $(recorded) == "codex" ]] && ok "enable did not claim the user's link" || bad "enable recorded: '$(recorded)'"

"$S" dispose --all >/dev/null 2>&1
[[ $(readlink "$HOME/.claude/skills/demo") == "$HOME/mine/demo" && -f $HOME/mine/demo/SKILL.md ]] \
  && ok "dispose --all left the user's link and its target alone" || bad "dispose removed the user's link"
[[ ! -e $HOME/.codex/skills/demo ]] && ok "dispose --all removed the link the plugin made" || bad "plugin link left behind"

"$S" disable demo --agents claude >/dev/null 2>&1
[[ -L $HOME/.claude/skills/demo ]] && ok "disable left the user's link alone" || bad "disable removed the user's link"

rm "$HOME/.claude/skills/demo"; mkdir "$HOME/.claude/skills/demo"
"$S" sync --scope personal --agents claude >/dev/null 2>&1
[[ -d $HOME/.claude/skills/demo && ! -L $HOME/.claude/skills/demo ]] && ok "a real folder in the way is left alone" || bad "sync touched a real folder"

echo
[[ $RC -eq 0 ]] && echo "ALL ASSERTIONS PASSED" || echo "ASSERTION FAILURES"
exit $RC
