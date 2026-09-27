#!/usr/bin/env bash
# Test: nanoclaw-integrate only adds what it records, and removes it exactly.
# Runs against a throwaway HOME with realistic user files; system commands
# (menu refresh, Hyprland reload, caches) are stubbed so nothing real changes.
set -uo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INT="$PLUGIN_DIR/bin/nanoclaw-integrate"
RC=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; RC=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
H="$T/home"
mkdir -p "$H/.config/omarchy/extensions" "$H/.config/hypr" "$H/.claude/skills/nanoclaw-mine" "$H/.codex/skills" "$T/bin" "$T/state"
cat >"$H/.config/omarchy/extensions/omarchy-menu.jsonc" <<'EOF'
{
  // Extend the Quickshell Omarchy menu with JSONC.
  "personal": {"icon":"","label":"Personal"},
  "personal.notes": {"icon":"󰎞","label":"Notes","action":"nvim ~/notes"}
}
EOF
printf -- '-- my bindings\no.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh box")\n' >"$H/.config/hypr/bindings.lua"
printf '# my bashrc\nalias ll="ls -l"\n' >"$H/.bashrc"
mkdir -p "$H/.codex/skills/nanoclaw"; echo "user's own skill" >"$H/.codex/skills/nanoclaw/SKILL.md"
for c in omarchy-menu hyprctl fc-cache gtk-update-icon-cache update-desktop-database; do
  printf '#!/bin/sh\nexit 0\n' >"$T/bin/$c"; chmod +x "$T/bin/$c"
done
cp "$H/.config/omarchy/extensions/omarchy-menu.jsonc" "$T/menu.orig"
cp "$H/.config/hypr/bindings.lua" "$T/bindings.orig"
cp "$H/.bashrc" "$T/bashrc.orig"

run() { HOME="$H" XDG_CONFIG_HOME= XDG_DATA_HOME= PATH="$T/bin:$PATH" NANOCLAW_STATE_DIR="$T/state" "$INT" "$@" </dev/null >"$T/out" 2>&1; }
menu_parses() {
  node -e '
    const s = require("fs").readFileSync(process.argv[1], "utf8")
      .replace(/^\s*\/\/[^\n]*(\n|$)/gm, "").replace(/,(\s*[}\]])/g, "$1");
    const o = JSON.parse(s);
    if (!o["personal.notes"]) process.exit(3);
    console.log(Object.keys(o).filter(k => k.startsWith("nanoclaw")).length);' "$1"
}

# Declining (no --yes, no terminal) changes nothing.
run install
cmp -s "$H/.bashrc" "$T/bashrc.orig" && cmp -s "$H/.config/omarchy/extensions/omarchy-menu.jsonc" "$T/menu.orig" \
  && pass "declined: no file touched" || fail "declined: files changed"

run install --yes
n="$(menu_parses "$H/.config/omarchy/extensions/omarchy-menu.jsonc")" && [[ $n -gt 40 ]] \
  && pass "menu: still valid, your entries kept, $n NanoClaw entries added (Omarchy's parser rules)" || fail "menu: broken ($n)"
grep -q "@PLUGIN@" "$H/.config/omarchy/extensions/omarchy-menu.jsonc" && fail "menu: placeholder left" \
  || pass "menu: paths point at this plugin"
grep -q "o.bind(\"SUPER + SHIFT + R\"" "$H/.config/hypr/bindings.lua" && grep -q "nanoclaw-default-agent launch --pick" "$H/.config/hypr/bindings.lua" \
  && pass "agent: keybinding added, yours kept" || fail "agent: bindings wrong"
grep -q 'alias ll=' "$H/.bashrc" && grep -q "nanoclaw-default-agent launch --inline" "$H/.bashrc" \
  && pass "agent: alias added, yours kept" || fail "agent: bashrc wrong"
[[ -f $H/.local/share/applications/rohirik.nanoclaw.desktop && -L $H/.local/share/icons/hicolor/256x256/apps/rohirik.nanoclaw.png ]] \
  && pass "app: desktop entry and icon installed" || fail "app: missing"
[[ -L $H/.local/bin/nanoclaw-ctl ]] && pass "commands: nanoclaw-ctl linked" || fail "commands: missing"
[[ -L $H/.claude/skills/nanoclaw && $(cat "$H/.codex/skills/nanoclaw/SKILL.md") == "user's own skill" ]] \
  && pass "skill: linked, and a real folder you own was left alone" || fail "skill: wrong"
ls "$H/.bashrc".bak.rohirik.nanoclaw.* >/dev/null 2>&1 && pass "backups written before edits" || fail "no backups"

run install --yes
[[ $(grep -c ">>> rohirik.nanoclaw" "$H/.config/omarchy/extensions/omarchy-menu.jsonc") == 1 && \
   $(grep -c ">>> rohirik.nanoclaw" "$H/.bashrc") == 1 ]] \
  && pass "reinstall: blocks replaced, not duplicated" || fail "reinstall duplicated blocks"

run remove --yes
cmp -s "$H/.config/omarchy/extensions/omarchy-menu.jsonc" "$T/menu.orig" && pass "remove: menu byte-identical to before" \
  || { fail "remove: menu differs"; diff "$T/menu.orig" "$H/.config/omarchy/extensions/omarchy-menu.jsonc"; }
cmp -s "$H/.config/hypr/bindings.lua" "$T/bindings.orig" && pass "remove: bindings byte-identical" || { fail "remove: bindings differ"; diff "$T/bindings.orig" "$H/.config/hypr/bindings.lua"; }
cmp -s "$H/.bashrc" "$T/bashrc.orig" && pass "remove: bashrc byte-identical" || { fail "remove: bashrc differs"; diff "$T/bashrc.orig" "$H/.bashrc"; }
[[ ! -e $H/.local/share/applications/rohirik.nanoclaw.desktop && ! -e $H/.local/bin/nanoclaw-ctl && ! -e $H/.claude/skills/nanoclaw ]] \
  && pass "remove: app entry, commands, skill links gone" || fail "remove: leftovers"
[[ -d $H/.codex/skills/nanoclaw ]] && pass "remove: your own skill folder untouched" || fail "remove: deleted a user folder"

# --- review: never overwrite or delete what is not ours -----------------------
APPS="$H/.local/share/applications"; D="$APPS/rohirik.nanoclaw.desktop"
mkdir -p "$APPS" "$H/.local/bin"
printf '[Desktop Entry]\nName=My own NanoClaw launcher\n' >"$D"
ln -s /usr/bin/true "$H/.local/bin/nanoclaw-ctl"
run install app commands --yes
[[ $(sed -n 2p "$D") == "Name=My own NanoClaw launcher" ]] && pass "app: an existing desktop entry of yours is not overwritten" \
  || fail "app: overwrote the user's desktop entry"
[[ $(readlink "$H/.local/bin/nanoclaw-ctl") == /usr/bin/true ]] && pass "commands: your own link with the same name is kept" \
  || fail "commands: replaced the user's link"
run remove app commands --yes
[[ -f $D && -L $H/.local/bin/nanoclaw-ctl ]] && pass "remove: your desktop entry and link survive" || fail "remove: deleted user files"

rm -f "$D" "$H/.local/bin/nanoclaw-ctl"
run install app --yes
grep -q "X-Rohirik-Nanoclaw-Managed=true" "$D" && pass "app: our own entry is written and marked" || fail "app: not written"
echo "NoDisplay=false" >>"$D"          # the user customizes it afterwards
run install app --yes
grep -q "^NoDisplay=false" "$D" && pass "app: reinstall keeps your later customization" || fail "app: reinstall clobbered the edit"
run remove app --yes
[[ -f $D ]] && grep -q "^NoDisplay=false" "$D" && pass "app: remove keeps a customized entry" || fail "app: remove deleted a customized entry"
rm -f "$D"; run install app --yes; run remove app --yes
[[ ! -e $D ]] && pass "app: an untouched entry of ours is removed" || fail "app: our entry was left behind"

echo
[[ $RC -eq 0 ]] && echo "ALL ASSERTIONS PASSED" || echo "ASSERTION FAILURES"
exit $RC
