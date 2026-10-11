#!/bin/sh
# Kontor lokal starten (macOS / Linux). Beenden mit Ctrl+C.
cd "$(dirname "$0")/ui-preview" || exit 1
PORT=8080
echo ""
echo "  KONTOR - lokaler Server"
echo "  Auf diesem Rechner:  http://localhost:$PORT"
IP=$( (ipconfig getifaddr en0 || hostname -I | awk '{print $1}') 2>/dev/null )
[ -n "$IP" ] && echo "  Im Netzwerk:         http://$IP:$PORT"
echo ""
( sleep 1; (open "http://localhost:$PORT" || xdg-open "http://localhost:$PORT") >/dev/null 2>&1 ) &
exec python3 -m http.server "$PORT"
