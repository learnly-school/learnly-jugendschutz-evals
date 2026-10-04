/**
 * Waechter als Entscheidungsmodell: eine choice-Frage, acht Optionen, eine Wahrscheinlichkeit je
 * Option aus einem einzigen Vorwaertsdurchlauf. Es wird kein Text erzeugt und nichts geparst.
 *
 * Ein Adapter fuer BEIDE Anbieter, weil Jeff dasselbe Anfrageformat benutzt wie Jev. Der
 * Unterschied liegt allein in Adresse und Schluessel:
 *   Jeff  selbst betrieben (jeff-serve), kein Schluessel
 *   Jev   gehostete API von TypeSafe, Schluessel noetig
 */

import { readFileSync } from 'node:fs';

const VORLAGE = JSON.parse(
  readFileSync(new URL('../../prompts/waechter-entscheidung.json', import.meta.url), 'utf8'),
);

export function entscheidungsAdapter({ name, url, modell, schluessel = null, anbieter, ort = 'lokal' }) {
  const { zustandsschluessel, frage } = VORLAGE;

  return {
    name,
    bauweise: 'entscheidung',
    liefertWahrscheinlichkeit: true,
    anbieter,
    ort,

    async entscheide(nachricht) {
      const kopf = { 'content-type': 'application/json' };
      if (schluessel) kopf.authorization = `Bearer ${schluessel}`;

      const start = performance.now();
      const antwort = await fetch(url, {
        method: 'POST',
        headers: kopf,
        body: JSON.stringify({
          model: modell,
          state: { [zustandsschluessel]: nachricht },
          questions: {
            [frage.schluessel]: {
              type: frage.type,
              instructions: frage.instructions,
              criteria: frage.criteria,
            },
          },
        }),
      });
      const dauerMs = performance.now() - start;

      if (!antwort.ok) {
        return { fehler: `HTTP ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`, dauerMs };
      }

      const daten = await antwort.json();
      const ergebnis = daten.answers?.[frage.schluessel];
      if (!ergebnis?.choice) {
        return { fehler: 'keine Auswahl in der Antwort', rohtext: JSON.stringify(daten).slice(0, 300), dauerMs };
      }

      const wahrscheinlichkeiten = ergebnis.probabilities ?? {};
      const pHarmlos = wahrscheinlichkeiten.harmlos ?? 0;

      return {
        blockiert: ergebnis.choice !== 'harmlos',
        kategorie: ergebnis.choice === 'harmlos' ? null : ergebnis.choice,
        // Die Zahl, die der generativen Bauweise fehlt: wie sicher ist sich das Modell?
        pBlock: 1 - pHarmlos,
        wahrscheinlichkeiten,
        konfidenz: ergebnis.confidence ?? null,
        rohtext: JSON.stringify(ergebnis),
        dauerMs,
      };
    },
  };
}
