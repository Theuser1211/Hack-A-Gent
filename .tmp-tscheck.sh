#!/usr/bin/env bash
set -e
ROOT="C:/Desktop/Working/Hack-A-Gent"
TMP="/tmp/hag-tscheck-$(date +%s)"
mkdir -p "$TMP"
# copy project skeleton (skip node_modules, symlink it)
cp -r "$ROOT/reddit-s-games-with-a-hook-hackathon"/* "$TMP"/ 2>/dev/null || true
rm -rf "$TMP/node_modules"
ln -s "$ROOT/reddit-s-games-with-a-hook-hackathon/node_modules" "$TMP/node_modules"
# write generated page into the project
node -e "
const fs = require('fs');
const { execSync } = require('child_process');
// re-use the orchestrator via tsx to emit the generated page
const out = execSync('cd \"$ROOT\" && npx tsx .tmp-verify-page.ts', { encoding: 'utf-8', cwd: '$ROOT' });
fs.writeFileSync('$TMP/src/app/page.tsx', out);
console.log('page written, length', out.length);
"
# typecheck with the generated project's own strict tsconfig
cd "$TMP"
npx tsc --noEmit -p tsconfig.json 2>&1 | head -30 || echo "TSC FAILED"
echo "---tscheck exit: $?---"
