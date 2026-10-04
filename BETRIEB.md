# Die Modelle hochbekommen

Der Prüfstand selbst braucht nur Node ab Version 20 und keine Abhängigkeit. Aufwand macht nur, die
Modelle zum Antworten zu bringen. Jedes spricht HTTP; der Prüfstand kennt sonst nichts von ihnen.

> Bevor etwas Fremdes installiert wird, bitte [`SICHERHEITSPRUEFUNG.md`](SICHERHEITSPRUEFUNG.md)
> lesen. Dort steht, was geprüft wurde und welche Risiken bleiben.

## Das generative Modell (Ollama)

```bash
ollama pull gemma3
ollama serve
```

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1 OLLAMA_MODELL=gemma3:latest \
  node src/lauf.mjs --modell gemma
```

Läuft Ollama auf einem anderen Rechner, genügt ein Tunnel:

```bash
ssh -N -L 11435:127.0.0.1:11434 <rechner>
OLLAMA_BASE_URL=http://127.0.0.1:11435/v1 node src/lauf.mjs --modell gemma
```

Jedes Modell in Ollama lässt sich so prüfen, nicht nur Gemma. `OLLAMA_MODELL` setzen und laufen
lassen.

## Jeff, selbst betrieben

Einmalig einrichten:

```bash
git clone https://github.com/firelex/jeff && cd jeff
git checkout d0173b4ee317a46dee031421b713f3fc5f868cfe   # der geprüfte Stand

# NUR das Serving-Profil. Ohne --no-default-groups kämen die Trainings- und
# Datenaufbau-Pakete mit, und das sind genau die netzwerkaktiven Teile.
uv sync --no-default-groups --extra mac     # Apple Silicon
# uv sync --no-default-groups --extra cuda  # NVIDIA
# uv sync --no-default-groups                # CPU

uv run --no-default-groups hf download mstrasser/Jeff-Qwen3.5-0.8B \
  --local-dir Jeff-Qwen3.5-0.8B --exclude "videos/*" --exclude "assets/*"
```

Die beiden `--exclude` sind nicht Kosmetik: Ohne sie lädt man rund 300 MB Demo-Videos mit. **Jedes
`--exclude` braucht sein eigenes Flag** — zwei Muster hinter einem Flag liest `hf download` als
Dateiauswahl und lädt dann fast nichts.

Starten:

```bash
JEFF_BACKEND=mlx JEFF_CHECKPOINT=Jeff-Qwen3.5-0.8B PORT=8765 \
  uv run --no-default-groups --extra mac jeff-serve
```

`JEFF_BACKEND=mlx` nur auf Apple Silicon; sonst weglassen.

```bash
node src/lauf.mjs --modell jeff08
```

Für das größere Modell dasselbe mit `mstrasser/Jeff-Qwen3.5-2B`, Port 8766, dann `--modell jeff2b`.
Beide Server können nebeneinander laufen.

## Jev, gehostet

Jev gibt es nur als API von TypeSafe AI. Ein Schlüssel kommt aus der TypeSafe-Konsole.

```bash
JEV_API_KEY=… node src/lauf.mjs --modell jev
```

Kosten sind vernachlässigbar: abgerechnet werden nur Eingabe-Token zu 42 US-Dollar je Milliarde.
Ein vollständiger Lauf über alle 140 Fälle mit drei Wiederholungen liegt bei rund 170 000 Token,
also deutlich unter einem US-Cent.

**Wichtig und bewusst:** Bei diesem Lauf verlässt das Korpus den eigenen Rechner. Das ist nur
zulässig, weil **jeder Satz erfunden ist**. Mit echten Nachrichten von Kindern wäre dieser Lauf
weder erlaubt noch vertretbar.

## Mehrere auf einmal

```bash
node src/lauf.mjs --modell gemma,jeff08,jeff2b --wiederholungen 3
```

Fehlt einem Modell der Dienst oder der Schlüssel, überspringt der Lauf es mit einer Meldung und
misst die übrigen weiter.

## Ein neues Modell aufnehmen

Spricht es die OpenAI-Chat-Schnittstelle, genügt ein Eintrag in `MODELLE` in
[`src/lauf.mjs`](src/lauf.mjs) mit `ollamaAdapter`. Spricht es das System-One-Format, derselbe
Eintrag mit `entscheidungsAdapter` und einer anderen Adresse. Für alles andere braucht es einen
eigenen Adapter in `src/adapter/`, der eine einzige Methode anbietet:

```js
async entscheide(nachricht) {
  return { blockiert, kategorie, pBlock, dauerMs };   // pBlock darf null sein
}
```
