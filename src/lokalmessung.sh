#!/usr/bin/env bash
# Lokale Messung auf EINER Maschine, mit immer nur EINEM Modell im Speicher.
#
# Warum das wichtig ist, und zwar doppelt:
#
#  1. Speicher. Drei Modellserver nebeneinander (Ollama mit Gemma, jeff-serve mit 0,8B, jeff-serve
#     mit 2B) belegen zusammen rund 10 GB. Auf einer Maschine, auf der nebenher anderes laeuft,
#     fuehrt das zum Abschuss mitten im Lauf.
#  2. Messung. Ein Modellserver, der nur herumliegt, haelt trotzdem Speicher. Das System faengt an
#     auszulagern, und die Zeiten des gerade gemessenen Modells werden dadurch schlechter. Zeiten,
#     die man nebeneinanderstellen will, muessen unter gleichen Bedingungen entstanden sein.
#
# Also: Server hoch, messen, Server runter, naechstes Modell.
#
#   src/lokalmessung.sh 3          # drei Durchgaenge
#
# Erwartet JEFF_REPO auf das geprüfte jeff-Arbeitsverzeichnis (siehe BETRIEB.md).

set -uo pipefail
cd "$(dirname "$0")/.."

DURCHGAENGE="${1:-3}"
# Mindestens 2, sonst laesst sich Stabilitaet nicht messen: ein einziger Durchlauf je Fall kann
# nicht zeigen, ob dasselbe Modell dieselbe Nachricht zweimal gleich beurteilt.
WIEDERHOLUNGEN="${2:-2}"
JEFF_REPO="${JEFF_REPO:?JEFF_REPO muss auf das jeff-Arbeitsverzeichnis zeigen}"
export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1}"

warte_auf() {  # warte_auf <url> <sekunden>
  local ende=$((SECONDS + $2))
  until curl -s --noproxy '*' --max-time 3 -o /dev/null "$1" 2>/dev/null; do
    [ $SECONDS -gt $ende ] && return 1
    sleep 2
  done
  return 0
}

beende() {  # beende <muster>
  pkill -f "$1" 2>/dev/null || true
  sleep 3
}

messe_gemma() {
  ollama serve >/tmp/ollama-messung.log 2>&1 &
  warte_auf http://127.0.0.1:11434/api/tags 60 || { echo "Ollama kam nicht hoch"; return 1; }
  node src/lauf.mjs --modell gemma --wiederholungen "$WIEDERHOLUNGEN"
  beende "ollama serve"
}

messe_jeff() {  # messe_jeff <checkpoint> <port> <modellschluessel>
  ( cd "$JEFF_REPO" && JEFF_BACKEND=mlx JEFF_CHECKPOINT="$1" PORT="$2" \
      uv run --no-default-groups --extra mac jeff-serve >/tmp/jeff-$2.log 2>&1 ) &
  warte_auf "http://127.0.0.1:$2/docs" 300 || { echo "jeff-serve $1 kam nicht hoch"; return 1; }
  node src/lauf.mjs --modell "$3" --wiederholungen "$WIEDERHOLUNGEN"
  beende "JEFF_CHECKPOINT=$1"
  beende "jeff-serve"
}

for i in $(seq 1 "$DURCHGAENGE"); do
  echo "=== Durchgang $i von $DURCHGAENGE ==="
  messe_gemma
  messe_jeff Jeff-Qwen3.5-0.8B 8765 jeff08
  messe_jeff Jeff-Qwen3.5-2B 8766 jeff2b

  for datei in ergebnisse/*.json; do
    name="$(basename "$datei" .json)"
    case "$name" in lauf*) continue ;; esac
    cp "$datei" "ergebnisse/lauf$i-$name.json"
  done
done

echo
echo "Fertig. Streuung ansehen mit: node src/streuung.mjs"
