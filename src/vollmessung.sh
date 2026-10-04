#!/usr/bin/env bash
# Die Messung, auf die sich der Artikel beruft: alle Konfigurationen, einheitlich drei
# Wiederholungen, immer nur EIN Modellserver im Speicher.
#
#   JEFF_REPO=… JEV_API_KEY=… src/vollmessung.sh
#
# Gemma läuft hier lokal. Die Zahl aus der Produktion (andere Ollama-Version) liegt separat unter
# ergebnisse/ollama-versionen/.

set -uo pipefail
cd "$(dirname "$0")/.."

JEFF_REPO="${JEFF_REPO:?JEFF_REPO muss auf das jeff-Arbeitsverzeichnis zeigen}"
WDH="${WDH:-3}"
export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1}"

warte_auf() {
  local ende=$((SECONDS + $2))
  until curl -s --noproxy '*' --max-time 3 -o /dev/null "$1" 2>/dev/null; do
    [ $SECONDS -gt $ende ] && return 1
    sleep 2
  done
}

beende() { pkill -f "$1" 2>/dev/null || true; sleep 3; }

echo "=== Gemma (lokal) ==="
ollama serve >/tmp/ollama-voll.log 2>&1 &
warte_auf http://127.0.0.1:11434/api/tags 60 && node src/lauf.mjs --modell gemma --wiederholungen "$WDH"
beende "ollama serve"

for paar in "Jeff-Qwen3.5-0.8B 8765 jeff08 jeff08b" "Jeff-Qwen3.5-2B 8766 jeff2b jeff2bb"; do
  set -- $paar
  echo "=== $1 (beide Frageformen) ==="
  ( cd "$JEFF_REPO" && JEFF_BACKEND=mlx JEFF_CHECKPOINT="$1" PORT="$2" \
      uv run --no-default-groups --extra mac jeff-serve >/tmp/jeff-$2.log 2>&1 ) &
  if warte_auf "http://127.0.0.1:$2/docs" 300; then
    node src/lauf.mjs --modell "$3" --wiederholungen "$WDH"
    node src/lauf.mjs --modell "$4" --wiederholungen "$WDH"
  else
    echo "jeff-serve $1 kam nicht hoch"
  fi
  beende "JEFF_CHECKPOINT=$1"
  beende "jeff-serve"
done

if [ -n "${JEV_API_KEY:-}" ]; then
  echo "=== Jev (gehostet, beide Frageformen) ==="
  node src/lauf.mjs --modell jev --wiederholungen "$WDH"
  node src/lauf.mjs --modell jevb --wiederholungen "$WDH"
else
  echo "JEV_API_KEY fehlt, Jev übersprungen"
fi

echo
echo "Fertig. Gesamtbild: node src/vergleich.mjs"
