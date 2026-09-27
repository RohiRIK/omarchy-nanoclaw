#!/usr/bin/env bash
# Regression test for nanoclaw-status argument parsing.
#
# The bug: `for arg in "$@"` iterates a snapshot of the argument list, so an
# in-loop `shift` desynchronised $1/$2 from the item being processed and the
# documented `--checkout PATH` form exited 2. Only `--checkout=PATH` worked,
# meaning the form in the script's own usage line was the broken one.
set -uo pipefail

# Resolved relative to this file so the test follows the plugin.
P="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/nanoclaw-status"
fails=0

# check NAME EXPECTED_SUBSTRING EXPECTED_EXIT -- args...
check() {
  local name="$1" want="$2" wantx="$3"; shift 4
  local out rc
  out=$("$P" "$@" 2>&1); rc=$?
  if [[ $rc -eq $wantx && "$out" == *"$want"* ]]; then
    echo "PASS  $name"
  else
    echo "FAIL  $name (exit=$rc want=$wantx)"; echo "$out" | head -3
    fails=$((fails + 1))
  fi
}

[[ -x $P ]] || { echo "FAIL  nanoclaw-status not found or not executable: $P"; exit 1; }

# Both spellings of --checkout must parse and select the same checkout.
a=$("$P" --checkout $HOME --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["checkout"])')
b=$("$P" --checkout=$HOME --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["checkout"])')
if [[ $a == $HOME && $b == $HOME ]]; then
  echo "PASS  --checkout PATH and --checkout=PATH agree (got '$a' / '$b')"
else
  echo "FAIL  --checkout forms disagree: '$a' vs '$b'"; fails=$((fails + 1))
fi

# A path-looking value must never be reported as an unknown argument.
out=$("$P" --checkout $HOME --preflight 2>&1)
if [[ "$out" != *"Unknown argument"* ]]; then
  echo "PASS  no stray 'Unknown argument' for the value token"
else
  echo "FAIL  value token treated as unknown: $out"; fails=$((fails + 1))
fi

# Flags in any order must all be honoured.
r=$("$P" --json --checkout $HOME --preflight >/dev/null 2>&1; echo $?)
[[ $r -eq 0 ]] && echo "PASS  reordered flags exit 0" || { echo "FAIL  reordered flags exit=$r"; fails=$((fails + 1)); }

# Guards still fire.
check "unknown flag rejected"   "Unknown argument: --bogus" 2 -- --bogus
check "dangling --checkout"    "requires a PATH"          2 -- --checkout
check "empty --checkout value" "non-empty PATH"           2 -- --json --checkout=

echo
if ((fails)); then echo "$fails assertion(s) failed"; exit 1; fi
echo "ALL ASSERTIONS PASSED"
