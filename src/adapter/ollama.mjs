/**
 * Generativer Waechter ueber Ollamas OpenAI-kompatiblen Endpunkt.
 *
 * Das Modell bekommt den Waechter-Prompt und schreibt sein Urteil als JSON-Text hin, den wir
 * parsen muessen. Genau das ist die Bauweise, gegen die hier gemessen wird: Es gibt keine
 * Wahrscheinlichkeit, nur ein Wort — und die Moeglichkeit, dass gar kein auswertbares JSON kommt.
 */

import { readFileSync } from 'node:fs';

const PROMPT = readFileSync(new URL('../../prompts/waechter-generativ.txt', import.meta.url), 'utf8');

/** Holt das erste JSON-Objekt aus der Antwort; Modelle umrahmen es gern mit Text oder Codezaun. */
function urteilAusText(text) {
  const treffer = text.match(/\{[^{}]*\}/);
  if (!treffer) return null;
  try {
    const roh = JSON.parse(treffer[0]);
    if (typeof roh.ok !== 'boolean') return null;
    return { blockiert: !roh.ok, kategorie: roh.ok ? null : String(roh.kategorie ?? 'sonstiges') };
  } catch {
    return null;
  }
}

export function ollamaAdapter({ basis, modell, ort = 'lokal' }) {
  return {
    name: `ollama:${modell}`,
    bauweise: 'generativ',
    liefertWahrscheinlichkeit: false,
    ort,

    /**
     * Version des Inferenz-Servers. Gehoert in jeden Bericht: Dasselbe Modell mit demselben Digest
     * verhaelt sich unter verschiedenen Ollama-Versionen nachweislich unterschiedlich (gemessen:
     * zwei Krisenfaelle kippen zwischen 0.30.10 und 0.32.1). Ohne diese Angabe ist ein Lauf nicht
     * reproduzierbar.
     */
    async umgebung() {
      try {
        const r = await fetch(`${basis.replace(/\/v1\/?$/, '')}/api/version`);
        const j = await r.json();
        return { server: `ollama ${j.version ?? 'unbekannt'}` };
      } catch {
        return { server: 'ollama (Version nicht abfragbar)' };
      }
    },

    async entscheide(nachricht) {
      const start = performance.now();
      const antwort = await fetch(`${basis}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modell,
          temperature: 0,
          max_tokens: 200,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: nachricht },
          ],
        }),
      });
      const dauerMs = performance.now() - start;

      if (!antwort.ok) {
        return { fehler: `HTTP ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`, dauerMs };
      }
      const daten = await antwort.json();
      const rohtext = daten.choices?.[0]?.message?.content ?? '';
      const urteil = urteilAusText(rohtext);

      // Keine auswertbare Antwort ist ein eigener Befund, kein Durchlassen und kein Blockieren.
      if (!urteil) return { fehler: 'Antwort nicht auswertbar', rohtext, dauerMs };

      return { ...urteil, rohtext, dauerMs, pBlock: null };
    },
  };
}
