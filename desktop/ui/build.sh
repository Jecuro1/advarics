#!/bin/sh
# Baut die Oberfläche (eine HTML-Datei) aus den Quellteilen in ui/src.
# Reihenfolge der Skripte ist wichtig: c4-system enthält init() und läuft zuletzt.
set -e
D="$(cd "$(dirname "$0")" && pwd)"
OUT="$D/../../ui-preview/index.html"
mkdir -p "$(dirname "$OUT")"
{
  cat "$D/src/a-head.html" "$D/src/b-body.html"
  echo '<script>'
  for f in c1-core c2-dashboard c3-pos c5-settings c6-catalog c7-updates c8-customers c9-returns c10-stats c4-system; do
    [ -f "$D/src/$f.js" ] && cat "$D/src/$f.js"
  done
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > "$OUT"
wc -c "$OUT"
