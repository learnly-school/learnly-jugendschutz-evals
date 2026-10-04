# Sicherheitsprüfung der verwendeten Fremdsoftware

Für diese Evals wird fremder Code ausgeführt und fremde Modellgewichte geladen. Beides wurde
vor der ersten Ausführung geprüft. Dieses Dokument hält fest, **was** geprüft wurde, **womit** und
**was dabei herauskam** — damit die Prüfung nachvollziehbar und wiederholbar ist und nicht als
„haben wir mal kurz angeschaut" durchgeht.

Geprüft am 4. Oktober 2026.

## 1. Was überhaupt ausgeführt wird

| Teil | Herkunft | Rolle |
| --- | --- | --- |
| `jeff` (Serverprogramm) | GitHub `firelex/jeff` | lädt die Gewichte und beantwortet Anfragen |
| `Jeff-Qwen3.5-0.8B`, `Jeff-Qwen3.5-2B` | Hugging Face `mstrasser/…` | die Modellgewichte |
| `ollama` | bereits im Betrieb | Baseline-Modell, nicht Gegenstand dieser Prüfung |

Geprüfter Stand des Serverprogramms:

```
commit  d0173b4ee317a46dee031421b713f3fc5f868cfe
Autor   Mathias Strasser <mstrasser@scissero.com>
Datum   2026-10-01T16:29:38+01:00
```

## 2. Herkunft und Identität

| Prüfung | Ergebnis |
| --- | --- |
| Lizenz Code | MIT |
| Lizenz Gewichte | Apache 2.0 |
| GitHub-Konto `firelex` | angelegt 2013-01-02, elf öffentliche Repositorien |
| Verbreitung | 1359 Sterne, 64 Forks |
| Identität | GitHub `firelex` = Commit-Autor Mathias Strasser = HF-Autor `mstrasser`; durchgängig stimmig |
| Zugangsbeschränkung Gewichte | keine (`gated: false`) |

**Namensähnlichkeit, die man kennen muss:** `Jeff` ist ein unabhängiger offener Nachbau, der
bewusst dasselbe Anfrageformat verwendet wie das kommerzielle `Jev` von TypeSafe AI. Die
Modellkarte stellt das selbst klar: *„not affiliated with or endorsed by TypeSafe"*. Wer „Jev"
sucht und „Jeff" installiert, installiert etwas anderes als gedacht — und umgekehrt. Das ist hier
beabsichtigt und bekannt, aber es ist genau die Art Verwechslung, über die Lieferkettenangriffe
laufen.

## 3. Abhängigkeiten

Installiert wurde ausschließlich das Serving-Profil (`uv sync --no-default-groups --extra mac`).
Das Trainings- und Datenaufbau-Profil bleibt draußen — dort liegen alle netzwerkaktiven Teile.

Alle Abhängigkeiten des Serving-Profils sind etablierte Pakete mit **exakt gepinnter Version**:

```
torch 2.14.0 · torchvision 0.29.0 · transformers 5.17.0 · pillow 12.3.0
fastapi 0.141.1 · uvicorn 0.52.4 · safetensors 0.8.0 · numpy 2.5.3
huggingface-hub 1.31.0 · mlx-lm 0.31.3   (Apple-Silicon-Zusatz)
```

Kein unbekanntes Paket, kein Paket mit tippfehlerähnlichem Namen, keine offenen Versionsbereiche,
die später stillschweigend etwas anderes einziehen könnten.

## 4. Telefoniert der Server nach Hause?

Das war die eigentliche Frage. Vorgehen: erst alle Dateien finden, die überhaupt einen
Netzwerk-Client importieren, dann prüfen, ob eine davon im Serve-Pfad liegt.

**Netzwerkfähige Dateien (10):** `synthetic.py`, `sft_synthetic.py`, `generate.py`, `teacher.py`,
`client.py`, `materials.py`, `voice.py`, `sampled.py`, `games/common.py`, `data.py`

**Der Serve-Pfad:** `server.py` → `model.py`, `types.py`, `mlx_backend.py`, `decoder.py`

> **Die Mengen sind disjunkt.** Keine der netzwerkfähigen Dateien liegt im Serve-Pfad. `server.py`
> importiert keinen einzigen Netzwerk-Client — nur `fastapi`, `uvicorn`, `PIL`, `pydantic` und
> Standardbibliothek.

Verstärkend: `httpx` steckt in der Gruppe `train`, die wir **nicht installiert haben**. Die
netzwerkaktiven Pfade könnten also nicht einmal laufen, wenn man sie aufriefe.

Sämtliche im Code gefundenen externen Adressen gehören zu Datensätzen für das Training
(ContractNLI, CUAD, MASSIVE, CMUdict) oder zur Erzeugung synthetischer Trainingsdaten über ein
Lehrer-Modell (`api.openai.com` in `synthetic.py`). Für den Betrieb spielt davon nichts eine Rolle,
aber man sollte es wissen, bevor man `uv sync` **ohne** `--no-default-groups` ausführt.

## 5. Auffällige Sprachkonstrukte

Gesucht wurde nach `eval`, `exec`, `os.system`, `subprocess`, `pickle.loads`, `__import__`,
`base64.b64decode`, `socket`. Drei echte Treffer, alle harmlos und alle erklärbar:

| Fundstelle | Was es ist | Bewertung |
| --- | --- | --- |
| `server.py:123` `base64.b64decode` | Prüfung hochgeladener Bilder | unbedenklich: Format-Allowlist (PNG/JPEG/WebP), 8-MB-Grenze, 16-Megapixel-Grenze, Abfang von `DecompressionBombError` — sorgfältiger als üblich |
| `puzzles.py:176` `eval` | erzeugt Trainingsrätsel | `__builtins__` ist leer; nur Boolesche Ausdrücke; nicht im Serve-Pfad |
| `latency.py:90` `subprocess` | liest `sysctl -n machdep.cpu.brand_string` | Prozessorname für die Messausgabe; nicht im Serve-Pfad |

Kein verschleierter Code, keine kodierten Nutzlasten, keine Installations-Hooks.

## 6. Die Modellgewichte

Der gefährlichste Teil einer Modellinstallation ist meist nicht der Code, sondern die
Gewichtsdatei: Das alte PyTorch-Format `.bin` ist eine Pickle-Datei und **führt beim Laden Code
aus**. Deshalb der entscheidende Blick ins Dateiverzeichnis:

```
model.safetensors      ← die Gewichte
readout.safetensors    ← der Entscheidungskopf
config.json · decision_config.json · processor_config.json
tokenizer.json · tokenizer_config.json · chat_template.jinja
```

> **Kein `.bin`, kein `.pt`, kein `.pkl`.** Das Safetensors-Format enthält nur Zahlen und kann beim
> Laden keinen Code ausführen. Damit entfällt der wichtigste Angriffsweg.

## 7. Restrisiken, die bleiben

Vollständigkeit ist hier nicht zu haben, und so zu tun wäre schlimmer als die Risiken zu benennen:

- **Commits sind nicht signiert.** `git log --format=%G?` liefert `N`. Die Urheberschaft stützt
  sich auf die Kontrollhoheit über das GitHub-Konto, nicht auf Kryptografie.
- **Geprüft wurde ein Stand, nicht das Projekt.** Diese Prüfung gilt für Commit `d0173b4`. Ein
  späterer Stand ist ungeprüft. Wer aktualisiert, prüft neu.
- **Die Abhängigkeiten selbst sind nicht auditiert.** Dass `torch` und `transformers` etabliert
  sind, ist ein Vertrauensargument, kein Beweis. Ein kompromittiertes Upstream-Paket träfe uns wie
  jeden anderen.
- **`uv sync` führt Build-Code aus.** Die Pakete liefern Wheels, es wird also im Normalfall nichts
  kompiliert; ausgeschlossen ist es nicht.
- **Der Jinja-Chat-Template wird gerendert.** Die Sandbox von `transformers` ist eingeschränkt, aber
  es ist ausführbare Vorlagenlogik aus fremder Quelle.
- **Nur gelesen, nicht beobachtet.** Diese Prüfung ist eine Code-Durchsicht. Ein Mitschnitt des
  Netzwerkverkehrs im laufenden Betrieb wäre die stärkere Aussage und ist nicht erfolgt.

## 8. Ergebnis

Für den Zweck dieser Evals — ein lokal laufender Entscheidungsdienst auf einer
Entwicklermaschine, der synthetische Testsätze einordnet — ist die Installation **vertretbar**. Die
beiden Eigenschaften, auf die es ankommt, sind erfüllt: **der Serve-Pfad kann nicht nach Hause
telefonieren, und die Gewichte können beim Laden keinen Code ausführen.**

Für einen Einsatz in der Produktion von learnly.school wären zusätzlich nötig: ein eigener
Systemnutzer ohne Schreibrechte außerhalb des Modellverzeichnisses, eine Netzwerkregel, die
ausgehenden Verkehr des Dienstes unterbindet, ein gepinnter Stand mit reproduzierbarer
Abhängigkeitsauflösung und eine wiederkehrende Prüfung bei jeder Aktualisierung.
