#!/bin/sh
# Baut die Oberfläche (eine HTML-Datei) aus den Quellteilen in ui/src.
# Reihenfolge der Skripte ist wichtig: c4-system enthält init() und läuft zuletzt.
set -e
D="$(cd "$(dirname "$0")" && pwd)"
OUT="$D/../../ui-preview/index.html"
mkdir -p "$(dirname "$OUT")"
# erst in eine Nebendatei schreiben und dann atomar austauschen – so liest nie jemand eine halbfertige Datei
TMP="$OUT.tmp.$$"
{
  cat "$D/src/a-head.html" "$D/src/b-body.html"
  echo '<script>'
  for f in c1-core c1a-dnd c2-dashboard c3-pos c5-settings c6-catalog c7-updates c8-customers c9-returns c10-stats c11-users c12-cash c13-rksv c14-print c15-purchasing c16-reports c17-wire c18-docs c19-stock c20-wire5 c21-custom c22-automation c23-security c24-ai-fibu c25-pages c26-import-display c27-verbund c28-auth c29-extensions c30-more c31-docs c32-einkauf c33-verkauf c34-marketing c35-artikel c36-verkauf3 c37-stamm c38-analyse c39-edi-webshop c40-kunden-service c41-artikel2 c42-wgrid c43-artikel-adv c44-einst-adv c45-einst-adv2 c46-kassen-edit c47-kassen-tabs c48-kassenkonfig c49-kassen-forms c50-kassen-wirkung c51-bonus c52-fibu-konten c53-einst-seiten c54-benutzer c55-benutzergruppen c55a-zugangsprofil c56-menue-rechte c4-system; do
    [ -f "$D/src/$f.js" ] && cat "$D/src/$f.js"
  done
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > "$TMP"
mv -f "$TMP" "$OUT"
wc -c "$OUT"
