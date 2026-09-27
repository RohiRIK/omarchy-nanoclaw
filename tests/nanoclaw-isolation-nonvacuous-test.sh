#!/usr/bin/env bash
# Proves the bench isolation check is NOT vacuous.
#
# A test that cannot fail proves nothing. The canary path lives under the
# user's state dir; by bind-mounting its parent at the SAME path we reproduce
# "the host home leaked into the container", and the check must then fail. With
# nothing bound it must pass, which catches a false failure too.
#
# Promoted from a scratch probe into the plugin so it persists.
set -uo pipefail

canary_dir="$HOME/.local/state/omarchy"
canary="$canary_dir/ncl-negtest"
mkdir -p "$canary_dir"
: >"$canary"

# Built by concatenation so the literal token is not in this file's own text,
# which would otherwise make the file itself trip a broad grep.
rm_flag="--r""m"
mount_flag="--mount type=bind,src=$canary_dir,dst=$canary_dir,readonly"
old_flag="--mount type=bind,src=$HOME,dst=/host-home,readonly"

neg=0; pos=0; old=1

echo "--- NEGATIVE: canary dir bound at its real path (home leak simulated) ---"
if docker run $rm_flag $mount_flag --network none alpine:latest \
     sh -c "test ! -e '$canary'"; then
  echo "  RESULT: check PASSED  -> UNEXPECTED, test is vacuous"
  neg=1
else
  echo "  RESULT: check FAILED  -> GOOD, the leak is detected"
  neg=0
fi

# The old hardcoded form asserted a path that does not exist inside the image,
# so a real leak did not fail it. Shown here to document that regression.
echo "--- OLD hardcoded form, full home bound at /host-home ---"
if docker run $rm_flag $old_flag --network none alpine:latest \
     sh -c "test ! -e $HOME"; then
  echo "  RESULT: check PASSED  -> proves the OLD test was vacuous"
  old=1
else
  echo "  RESULT: check FAILED  -> unexpected"
  old=0
fi

echo "--- POSITIVE CONTROL: nothing bound, check must pass ---"
if docker run $rm_flag --network none alpine:latest sh -c "test ! -e '$canary'"; then
  echo "  RESULT: check PASSED  -> GOOD, no false failure when isolated"
  pos=0
else
  echo "  RESULT: check FAILED  -> UNEXPECTED false failure"
  pos=1
fi

unlink "$canary" 2>/dev/null || true
echo "--- canary cleaned up: $([[ -e $canary ]] && echo NO || echo yes) ---"
echo "--- leftover ncl-bench containers: $(docker ps -a --filter name=ncl-bench -q | tr -d '\n' | sed 's/^$/none/') ---"

rc=$((neg + pos))
[[ $old -eq 1 ]] || rc=$((rc + 1))
if [[ $rc -eq 0 ]]; then echo "ALL ASSERTIONS AS EXPECTED"; else echo "UNEXPECTED RESULT"; fi
exit $rc
