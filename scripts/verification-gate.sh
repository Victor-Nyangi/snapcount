#!/usr/bin/env bash
# The plan's verification gate (resources/nfl-implemnentation2.md), as a
# runnable script rather than a block of prose to retype.
#
# Two exemptions are declared here rather than left implicit, because the
# gate as written in the plan cannot pass without them and a gate that
# cannot pass gets ignored:
#
#   1. COMMENTS. Both greps match their own explanations — a comment saying
#      why a token replaced `#fff` contains `#fff`. Comment lines are
#      stripped before matching. The constraint is about what the RUNTIME
#      uses, not what the prose mentions.
#   2. VENDORED PRIMITIVES. `components/ui/` and `components/Common/` are
#      shadcn/template code from the `full-stack-fast` scaffold, not ours;
#      19 of the 20 bracketed-pixel hits live there and rewriting upstream
#      components to satisfy our house rule would make every future
#      template update a merge conflict. Exactly one hit was ours and it is
#      now `--lift-hover` (theme.css §1.14).
#
# Anything outside those two exemptions is a real violation.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"

fail=0
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
check() { if [ "$1" -eq 0 ]; then echo "  PASS"; else echo "  FAIL"; fail=1; fi; }

step "backend tests";      (cd backend && uv run pytest -q | tail -1); check $?
step "frontend unit tests"; bun run --filter frontend test:unit 2>&1 | grep -E "Tests +[0-9]"; check $?
step "frontend build";      bun run --filter frontend build >/dev/null 2>&1; check $?
step "frontend lint";       bun run --filter frontend lint >/dev/null 2>&1; check $?

# `sed` strips // and /* */ single-line comments and CSS comment bodies.
strip_comments() { sed -E 's:^[[:space:]]*(//|\*|/\*).*$::' ; }

step "no hex literals outside lib/contrast.ts"
hits=$(grep -rnE '#[0-9A-Fa-f]{3,8}' frontend/src --include='*.tsx' --include='*.ts' \
  | grep -v 'lib/contrast.ts' | grep -v '\.test\.' \
  | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)
[ -z "$hits" ] && echo "  PASS" || { echo "$hits"; echo "  FAIL"; fail=1; }

step "no arbitrary bracketed px/rem in our own code"
hits=$(grep -rnE '\[[0-9]+(px|rem)\]' frontend/src \
  | grep -vE 'components/(ui|Common)/' \
  | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)
[ -z "$hits" ] && echo "  PASS" || { echo "$hits"; echo "  FAIL"; fail=1; }

printf '\n'
[ "$fail" -eq 0 ] && echo "VERIFICATION GATE: PASS" || echo "VERIFICATION GATE: FAIL"
exit "$fail"
