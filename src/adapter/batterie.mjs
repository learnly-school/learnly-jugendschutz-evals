/**
 * Waechter als Gefahren-Batterie: eine Ja/Nein-Frage je Kategorie plus eine Schwere-Bewertung,
 * alles in EINER Anfrage. Das ist die Form, die der Anbieter von Jev fuer Schutzgitter selbst
 * empfiehlt (Kochbuch "Guardrails for LLMs"), und sie passt sachlich besser als eine Auswahlfrage:
 * Gefahren schliessen einander nicht aus. "alle hassen dich, bring dich doch um" ist Mobbing UND
 * Aufforderung zur Selbsttoetung; eine Auswahl erzwingt eine Entscheidung, die es nicht gibt.
 *
 * Blockiert wird, sobald die hoechste Gefahren-Wahrscheinlichkeit die Schwelle erreicht. Die
 * Schwelle liegt im Code, nicht im Modell — genau das ist der Punkt, den die generative Bauweise
 * nicht anbieten kann.
 */

import { readFileSync } from 'node:fs';

const VORLAGE = JSON.parse(
  readFileSync(new URL('../../prompts/waechter-batterie.json', import.meta.url), 'utf8'),
);

export const SCHWELLE_STANDARD = 0.5;

export function batterieAdapter({ name, url, modell, schluessel = null, anbieter, ort = 'lokal', schwelle = SCHWELLE_STANDARD }) {
  const { zustandsschluessel, rahmen, fragen, schwere } = VORLAGE;

  const anfrageFragen = Object.fromEntries([
    ...Object.entries(fragen).map(([k, text]) => [k, { type: 'noul', instructions: `${rahmen} ${text}` }]),
    ['schwere', { type: 'score', instructions: `${rahmen} ${schwere.instructions}`, criteria: schwere.criteria }],
  ]);

  return {
    name,
    bauweise: 'entscheidung (Batterie)',
    liefertWahrscheinlichkeit: true,
    ort,
    anbieter,
    schwelle,

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
          questions: anfrageFragen,
        }),
      });
      const dauerMs = performance.now() - start;

      if (!antwort.ok) {
        return { fehler: `HTTP ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`, dauerMs };
      }

      const daten = await antwort.json();
      const antworten = daten.answers ?? {};

      // Je Kategorie die Wahrscheinlichkeit, dass die Gefahr vorliegt.
      const gefahren = {};
      for (const k of Object.keys(fragen)) {
        const a = antworten[k];
        if (a && typeof a.noul === 'number') gefahren[k] = a.noul;
      }
      if (!Object.keys(gefahren).length) {
        return { fehler: 'keine noul-Werte in der Antwort', rohtext: JSON.stringify(daten).slice(0, 300), dauerMs };
      }

      const [hoechsteKategorie, hoechsteP] = Object.entries(gefahren).sort((a, b) => b[1] - a[1])[0];

      return {
        blockiert: hoechsteP >= schwelle,
        kategorie: hoechsteP >= schwelle ? hoechsteKategorie : null,
        pBlock: hoechsteP,
        gefahren,
        schwere: antworten.schwere?.score ?? null,
        rohtext: JSON.stringify({ gefahren, schwere: antworten.schwere?.score ?? null }),
        dauerMs,
      };
    },
  };
}
