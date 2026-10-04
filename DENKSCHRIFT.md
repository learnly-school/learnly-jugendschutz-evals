# Denkschrift: wie diese Evals entworfen sind

Dieses Dokument hält die Entscheidungen fest, bevor Zahlen da sind. Wer später eine Zahl anzweifelt,
soll hier nachlesen können, was gemessen werden sollte und warum — und nicht erst aus dem Ergebnis
rückschließen müssen, was wohl gemeint war.

## 1. Die Frage

In einem Schul-Chat sitzt vor dem eigentlichen Sprachmodell ein **Wächter**: ein kleines Modell, das
jede Kinder-Nachricht ansieht und entscheidet, ob sie durchgeht. Es hat keine Werkzeuge, es schreibt
keinen Text an das Kind, es trifft eine Entscheidung.

Die Frage lautet: **Welches Modell trifft diese Entscheidung am besten — und zwar auf Deutsch, in der
Sprache, in der Zehn- bis Vierzehnjährige wirklich schreiben?**

Das ist eine andere Frage als die, die übliche Benchmarks beantworten. Die messen Englisch, erwachsene
Prosa und meist die *Fähigkeit*, nicht die *Zuverlässigkeit unter Alltagslast*.

## 2. Warum gerade jetzt, und warum diese drei

Die gängige Bauweise ist: ein generatives Modell bekommt einen Prompt („Antworte mit JSON …") und
schreibt seine Entscheidung als Text hin, den man dann parst. Das ist der Ist-Zustand in learnly.school:
**Gemma 3 4B**, lokal über Ollama.

Dagegen steht eine neue Gattung, **Entscheidungsmodelle** (vom Anbieter „System-1-Modelle" genannt).
Sie erzeugen keinen Text. Man beschreibt die Lage und listet die Optionen; zurück kommt in einem
einzigen Vorwärtsdurchlauf eine **Wahrscheinlichkeit je Option**. Der bekannteste Vertreter ist
**Jev** von TypeSafe AI.

### Zwei Namen, die man nicht verwechseln darf

Das ist die erste Falle, und sie hat uns selbst erwischt:

| | **Jev** | **Jeff** |
| --- | --- | --- |
| Anbieter | TypeSafe AI | Mathias Strasser (unabhängig) |
| Gewichte | geschlossen | offen, Apache 2.0 |
| Betrieb | nur gehostete API | selbst betreibbar |
| Anfrageformat | das Original | **bewusst identisch** |

Die Jeff-Modellkarte sagt es selbst: *„Jeff uses the same request format as Jev, but it is not
affiliated with or endorsed by TypeSafe, the makers of Jev."* Jeff ist also kein Tippfehler und kein
Klon im abwertenden Sinn, sondern ein offener Nachbau derselben Idee mit demselben Stecker.

Damit ist die Vergleichsachse klar: **Jev ist der Maßstab, über den alle reden. Die Frage ist, was
herankommt — und zwar unter der Nebenbedingung, dass eine deutsche Schule es betreiben darf.**

## 3. Die Nebenbedingung, die alles entscheidet

learnly.school hat eine zugesagte und im Code erzwungene Eigenschaft: **der Wächter läuft lokal.**
Nicht „ist lokal konfiguriert", sondern der Klassifizierer wirft eine Ausnahme, wenn das Modell nicht
das Präfix `ollama:` trägt. Diese Zusage steht an vier Stellen in nutzersichtbaren Texten, unter
anderem auf der Eltern-Transparenzseite.

Daraus folgt eine unangenehme, aber ehrliche Konsequenz:

> **Jev kann unser Wächter nicht werden.** Es gibt keine offenen Gewichte, kein Self-Hosting, keine
> VPC-Variante. Ein Wechsel zu Jev hieße, eine gegebene Zusage zurückzunehmen und einen dritten
> KI-Unterauftragnehmer aufzunehmen.

Jev bleibt trotzdem im Vergleich — **als Messlatte, nicht als Kandidat**. Man muss wissen, wie viel
Genauigkeit die Selbstbetreibbarkeit kostet. Wenn der Abstand klein ist, ist die Entscheidung leicht.
Wenn er groß ist, muss man das aushalten und benennen.

Dass die Messung gegen eine gehostete API laufen darf, liegt allein daran, dass **das Korpus
vollständig synthetisch ist** (siehe §6). Es verlassen keine Schülerdaten das Haus. Mit echten Daten
wäre dieser Lauf nicht zulässig.

## 4. Was gemessen wird

Ein Wächter kann auf zwei Arten versagen, und die Fehler sind **nicht gleich teuer**:

- **Durchlassen, was hätte blockiert werden müssen** — der Schaden ist potenziell groß und betrifft
  ein Kind in einer schlechten Lage.
- **Blockieren, was harmlos war** — der Schaden ist klein, aber häufig. Und Häufigkeit tötet Produkte:
  Ein Wächter, der beim Mathe-Üben grundlos dazwischengeht, wird abgeschaltet und schützt dann
  niemanden mehr.

Deshalb werden beide Seiten getrennt berichtet und **nie zu einer einzigen Genauigkeit verrechnet**.
Eine Gesamtgenauigkeit über ein Korpus, dessen Mischungsverhältnis wir selbst gewählt haben, wäre eine
Zahl, die mehr über unsere Korpus-Mischung aussagt als über das Modell.

Berichtet werden:

| Maß | Bedeutung | Warum es zählt |
| --- | --- | --- |
| **Trefferquote Gefahr** | Anteil der riskanten Nachrichten, die blockiert wurden | der eigentliche Schutz |
| **Krisen-Trefferquote** | dasselbe, nur für `selbstgefaehrdung` | daran hängt der Alarm an die Lehrkraft und der Hilfetext |
| **Durchlassquote harmlos** | Anteil der harmlosen Nachrichten, die durchgingen | Alltagstauglichkeit |
| **Kategorie-Treffer** | richtige Kategorie bei richtiger Blockade | steuert den Hinweistext, nicht den Schutz |
| **Zeit je Entscheidung** | Median | jede Kindernachricht wartet darauf |
| **Kalibrierung (ECE)** | stimmt die ausgegebene Wahrscheinlichkeit? | nur bei Entscheidungsmodellen messbar — siehe §5 |

Die **Krisen-Trefferquote ist die Kennzahl, auf die es ankommt.** Alles andere ist nachgeordnet.

## 5. Die These: eine Zahl schlägt ein Wort

Der strukturelle Unterschied zwischen den Bauweisen ist nicht „größer gegen kleiner", sondern:

- Ein **generatives** Modell liefert ein **Wort**. „blockieren" oder „ok". Es gibt keinen Zwischenwert.
  Wenn es unsicher ist, sieht man das nicht. Man kann nichts justieren, nur den Prompt umformulieren
  und hoffen.
- Ein **Entscheidungsmodell** liefert eine **Zahl**. „0,62 Selbstgefährdung". Daraus wird eine Schwelle,
  und eine Schwelle kann man dorthin schieben, wo der Schaden asymmetrisch ist: Beim Kinderschutz darf
  man bei 0,3 schon blockieren, beim Mathe-Chat erst bei 0,9.

Genau das ist der Grund, warum diese Messung überhaupt interessant ist, und nicht nur ein weiterer
Modellvergleich. **Wenn ein 0,8-Milliarden-Modell mit einer kalibrierten Wahrscheinlichkeit den
Krisenfall zuverlässiger erwischt als ein viermal so großes generatives Modell mit einem Prompt, dann
ist das eine Aussage über Architektur, nicht über Größe.**

Es kann auch anders ausgehen. Dann steht das hier genauso.

Wichtig für die Redlichkeit: Für Gemma lässt sich **keine** Kalibrierung messen, weil es keine
Wahrscheinlichkeit ausgibt. Das ist kein Messfehler, den man wegrechnen müsste, sondern der Befund
selbst. In der Ergebnistabelle steht dort „nicht messbar", nicht „0".

## 6. Das Korpus

Das bestehende learnly-Korpus hat **13 Fälle**. Als Stolperdraht im CI ist das richtig dimensioniert:
Es soll merken, wenn ein Prompt-Umbau den Wächter kaputt macht. Als Grundlage für eine öffentliche
Aussage ist es **zu klein** — bei 13 Fällen ist ein einziger Ausrutscher acht Prozentpunkte.

Deshalb ein eigenes, größeres Korpus. Die Entwurfsregeln:

**a) Harmlos ist die Mehrheit.** Im echten Betrieb sind fast alle Nachrichten unverdächtig. Ein Korpus,
das zur Hälfte aus Gefahren besteht, belohnt Modelle, die im Zweifel blockieren — also genau das
falsche Verhalten.

**b) Die schweren Fälle sind die harmlosen.** Der wertvollste Teil sind **Fallstricke**: Nachrichten,
die riskant *aussehen* und es nicht sind. Im Deutschunterricht wird gemordet, im Chemieunterricht wird
erhitzt, im Geschichtsunterricht geht es um Gewalt, und Kinder reden in Hyperbeln („ich sterbe gleich",
„ich bring ihn um" als Floskel). Ein Wächter, der daran scheitert, ist im Schulalltag unbrauchbar.
Diese Fälle trennen die Modelle stärker als die eindeutigen Gefahren.

**c) Gefahr ist nicht gleich laut.** Jeder Gefahrenfall bekommt eine Stufe:
- `explizit` — steht wörtlich da,
- `beilaeufig` — nebenbei erwähnt, ohne Dramatik,
- `verdeckt` — nur aus dem Ton erkennbar.

Der bekannte Schwachpunkt des Ist-Zustands ist genau die verdeckte Stufe: *„Ich mag einfach nicht
mehr."* Ohne Stufen sieht man im Gesamtergebnis nicht, **wo** ein Modell versagt.

**d) So, wie Kinder schreiben.** Kleinschreibung, Tippfehler, Abkürzungen, Emoji, Dialekt. Ein Korpus
in sauberer Schriftsprache misst eine Sprache, die im Produkt nicht vorkommt. Jeder Fall trägt ein
Register-Merkmal, damit man hinterher prüfen kann, ob ein Modell an der Rechtschreibung scheitert statt
am Inhalt.

**e) Vollständig erfunden.** Kein Satz stammt von einem echten Kind, aus einem echten Chat oder aus
einem echten Datenbestand. Das ist nicht nur Datenschutz, sondern Voraussetzung dafür, das Korpus
überhaupt veröffentlichen und gegen eine fremde API schicken zu dürfen.

**f) Die Erwartung ist begründet.** Jeder Fall trägt ein Feld, das sagt, *warum* die erwartete Antwort
die richtige ist. Wo wir selbst schwanken, steht das dabei. Eine Messung, deren Goldstandard nicht
begründet ist, misst die Laune ihres Autors.

## 7. Was diese Evals nicht können

Damit niemand mehr hineinliest, als drinsteht:

- **Ein Autor.** Die Fälle und ihre erwarteten Antworten stammen aus einer Hand. Kein zweites,
  unabhängiges Urteil, keine Übereinstimmungsquote zwischen mehreren Bewertenden. Wo ein Fall
  strittig ist, ist das vermerkt, aber das ersetzt keine zweite Meinung.

  **Deshalb heißt das hier „Evals" und nicht „Benchmark".** Ein Benchmark beansprucht, der Maßstab
  zu sein, an dem sich fremde Modelle messen lassen; diesen Anspruch trägt ein Goldstandard aus
  einer Hand nicht. Evals sind das, was man gegen das eigene System fährt, offengelegt und
  widerlegbar. Das ist hier die ehrliche Beschreibung — und es verschiebt auch die Frage: nicht
  „wer gewinnt", sondern „ist unser Schutz gut genug".
- **Erfundene Sprache.** Wir ahmen nach, wie Kinder schreiben. Ob wir das gut treffen, ist selbst eine
  Annahme.
- **Ein Prompt je Bauweise.** Ein besserer Prompt für Gemma oder bessere Optionstexte für Jeff könnten
  die Zahlen verschieben. Gemessen wird der jeweils dokumentierte, nicht der bestmögliche Stand. Beide
  Prompts liegen im Repository, damit das jemand widerlegen kann.
- **Ein Lauf ist kein Beweis.** Temperatur 0 heißt nicht Determinismus. Jeder Fall wird mehrfach
  gemessen, und wo Läufe auseinandergehen, steht die Streuung dabei.
- **Keine Mehrfachnachrichten.** Gemessen werden einzelne Nachrichten. Ein Kind, das seine Lage über
  fünf Nachrichten hinweg aufbaut, ist ein schwererer und hier ungemessener Fall.

## 8. Warum das öffentlich wird

Zwei Gründe, beide ehrlich:

Der erste ist Rechenschaft. Wer einer Schule zusagt, dass ein Jugendschutz-Wächter läuft, sollte
zeigen können, **wie gut** er läuft — nicht nur, dass es ihn gibt. Ein nachvollziehbares Korpus mit
nachvollziehbaren Zahlen ist der Unterschied zwischen einer Zusage und einer Behauptung.

Der zweite ist Nutzen. Für deutschsprachigen Kinderschutz in Schul-Chats gibt es, soweit wir sehen,
keinen offenen Prüfstand. Wer so etwas baut, fängt bei null an. Das muss nicht sein.

Und ein unangenehmer dritter Grund, der dazugehört: Wenn der Ist-Zustand schlecht abschneidet, steht
das hier auch. Eine Messung, die ihr Betreiber nur veröffentlicht, wenn er gewinnt, ist Werbung.
