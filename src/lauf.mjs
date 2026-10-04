#!/usr/bin/env node
/**
 * Waechter-Benchmark: ein Korpus, mehrere Modelle, dieselben Fragen.
 *
 *   node src/lauf.mjs --modell gemma
 *   node src/lauf.mjs --modell jeff08 --wiederholungen 3
 *   node src/lauf.mjs --modell alle
 *
 * Schreibt je Lauf eine JSON-Datei nach ergebnisse/ und gibt eine Tabelle aus. Der Lauf aendert
 * nichts am Korpus und faellt nicht aus, wenn ein Modell fehlschlaegt: ein Fehler ist ein Befund.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ollamaAdapter } from './adapter/ollama.mjs';
import { entscheidungsAdapter } from './adapter/entscheidung.mjs';
import { batterieAdapter } from './adapter/batterie.mjs';
import { auswerten, tabelle } from './auswertung.mjs';

const WURZEL = new URL('..', import.meta.url);
const KORPUS = JSON.parse(readFileSync(new URL('korpus/korpus.json', WURZEL), 'utf8'));

/** Der eine Ort, an dem steht, was verglichen wird. */
const MODELLE = {
  gemma: () =>
    ollamaAdapter({
      basis: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1',
      modell: process.env.OLLAMA_MODELL ?? 'gemma3:latest',
    }),
  jeff08: () =>
    entscheidungsAdapter({
      name: 'Jeff-Qwen3.5-0.8B',
      anbieter: 'selbst betrieben (jeff-serve)',
      url: `${process.env.JEFF_BASE_URL ?? 'http://127.0.0.1:8765'}/v1/systemone`,
      modell: 'jeff-latest',
    }),
  jeff2b: () =>
    entscheidungsAdapter({
      name: 'Jeff-Qwen3.5-2B',
      anbieter: 'selbst betrieben (jeff-serve)',
      url: `${process.env.JEFF2B_BASE_URL ?? 'http://127.0.0.1:8766'}/v1/systemone`,
      modell: 'jeff-latest',
    }),
  // Dieselben Modelle, aber mit der Frageform, die der Jev-Anbieter fuer Schutzgitter empfiehlt.
  jeff08b: () =>
    batterieAdapter({
      name: 'Jeff-0.8B (Batterie)',
      anbieter: 'selbst betrieben (jeff-serve)',
      url: `${process.env.JEFF_BASE_URL ?? 'http://127.0.0.1:8765'}/v1/systemone`,
      modell: 'jeff-latest',
    }),
  jeff2bb: () =>
    batterieAdapter({
      name: 'Jeff-2B (Batterie)',
      anbieter: 'selbst betrieben (jeff-serve)',
      url: `${process.env.JEFF2B_BASE_URL ?? 'http://127.0.0.1:8766'}/v1/systemone`,
      modell: 'jeff-latest',
    }),
  jevb: () => {
    const schluessel = process.env.JEV_API_KEY;
    if (!schluessel) throw new Error('JEV_API_KEY fehlt — Jev ist nur ueber die gehostete API erreichbar.');
    return batterieAdapter({
      name: 'Jev (Batterie)',
      anbieter: 'gehostete API (TypeSafe AI)',
      url: process.env.JEV_URL ?? 'https://api.typesafe.ai/v1/systemone',
      modell: process.env.JEV_MODELL ?? 'jev-latest',
      schluessel,
    });
  },
  jev: () => {
    const schluessel = process.env.JEV_API_KEY;
    if (!schluessel) throw new Error('JEV_API_KEY fehlt — Jev ist nur ueber die gehostete API erreichbar.');
    return entscheidungsAdapter({
      name: 'Jev',
      anbieter: 'gehostete API (TypeSafe AI)',
      url: process.env.JEV_URL ?? 'https://api.typesafe.ai/v1/systemone',
      modell: process.env.JEV_MODELL ?? 'jev-latest',
      schluessel,
    });
  },
};

function argument(flagge, standard) {
  const i = process.argv.indexOf(`--${flagge}`);
  return i === -1 ? standard : process.argv[i + 1];
}

/** Ein Fall mehrfach messen; Streuung zwischen den Laeufen ist selbst ein Ergebnis. */
async function messe(adapter, fall, wiederholungen) {
  const laeufe = [];
  for (let i = 0; i < wiederholungen; i++) {
    try {
      laeufe.push(await adapter.entscheide(fall.text));
    } catch (e) {
      laeufe.push({ fehler: e instanceof Error ? e.message : String(e), dauerMs: 0 });
    }
  }
  const gueltig = laeufe.filter((l) => !l.fehler);
  const blockaden = gueltig.filter((l) => l.blockiert).length;

  return {
    id: fall.id,
    // Mehrheitsentscheid ueber die Wiederholungen; bei Gleichstand gilt die sichere Seite.
    blockiert: gueltig.length === 0 ? null : blockaden * 2 >= gueltig.length,
    stabil: gueltig.length > 0 && (blockaden === 0 || blockaden === gueltig.length),
    kategorie: gueltig.find((l) => l.blockiert)?.kategorie ?? null,
    pBlock: gueltig.length ? mittel(gueltig.map((l) => l.pBlock).filter((p) => p !== null && p !== undefined)) : null,
    dauerMs: gueltig.length ? mittel(gueltig.map((l) => l.dauerMs)) : null,
    fehler: gueltig.length === 0 ? laeufe[0].fehler : null,
    rohtext: laeufe[0].rohtext ?? null,
  };
}

const mittel = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function main() {
  const wahl = argument('modell', 'gemma');
  const wiederholungen = Number(argument('wiederholungen', '3'));
  const schluessel = wahl === 'alle' ? Object.keys(MODELLE) : wahl.split(',');

  mkdirSync(new URL('ergebnisse/', WURZEL), { recursive: true });
  const berichte = [];

  for (const s of schluessel) {
    if (!MODELLE[s]) {
      console.error(`Unbekanntes Modell "${s}". Bekannt: ${Object.keys(MODELLE).join(', ')}`);
      process.exitCode = 2;
      continue;
    }
    let adapter;
    try {
      adapter = MODELLE[s]();
    } catch (e) {
      console.error(`\n${s}: uebersprungen — ${e.message}\n`);
      continue;
    }

    process.stderr.write(`\n${adapter.name}: ${KORPUS.faelle.length} Faelle x ${wiederholungen}\n`);
    const messungen = [];
    for (const fall of KORPUS.faelle) {
      messungen.push(await messe(adapter, fall, wiederholungen));
      process.stderr.write(`\r  ${messungen.length}/${KORPUS.faelle.length}`);
    }
    process.stderr.write('\n');

    const bericht = auswerten(adapter, KORPUS, messungen, wiederholungen);
    berichte.push(bericht);
    const datei = new URL(`ergebnisse/${s}.json`, WURZEL);
    writeFileSync(datei, JSON.stringify(bericht, null, 2) + '\n');
    process.stderr.write(`  geschrieben: ergebnisse/${s}.json\n`);
  }

  if (berichte.length) console.log('\n' + tabelle(berichte));
}

await main();
