#!/usr/bin/env node
/**
 * Wie weit liegen die Durchgaenge auseinander? Liest die Dateien aus `src/mehrfachlauf.sh`
 * (lauf<N>-<modell>.json) und zeigt je Modell Spanne und Median ueber alle Durchgaenge.
 *
 * Zweck: eine einzelne Zahl aus einem einzelnen Lauf als das kennzeichnen, was sie ist. Bei der
 * Qualitaet erwarten wir wenig Streuung (dasselbe Korpus, Temperatur 0), bei der Zeit viel, weil
 * auf der Maschine nebenher anderes laeuft.
 */

import { readdirSync, readFileSync } from 'node:fs';

const WURZEL = new URL('..', import.meta.url);

const laeufe = readdirSync(new URL('ergebnisse/', WURZEL))
  .filter((d) => /^lauf\d+-.*\.json$/.test(d))
  .map((d) => ({ datei: d, ...JSON.parse(readFileSync(new URL(`ergebnisse/${d}`, WURZEL), 'utf8')) }));

if (!laeufe.length) {
  console.error('Keine Mehrfachlauf-Dateien. Erst src/mehrfachlauf.sh laufen lassen.');
  process.exit(1);
}

const nachModell = new Map();
for (const l of laeufe) {
  if (!nachModell.has(l.modell)) nachModell.set(l.modell, []);
  nachModell.get(l.modell).push(l);
}

const spanne = (werte) => {
  const g = werte.filter((x) => typeof x === 'number');
  if (!g.length) return null;
  return { min: Math.min(...g), max: Math.max(...g), n: g.length };
};
const pz = (x) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(1)}%`);

console.log(`\n## Streuung über ${laeufe.length / nachModell.size} Durchgänge\n`);
console.log('| Modell | Ort | Trefferquote Gefahr | Krise | harmlos durch | Median ms | p90 ms |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');

for (const [modell, ls] of nachModell) {
  const q = (feld) => {
    const s = spanne(ls.map((l) => l.kennzahlen[feld]));
    if (!s) return '–';
    return s.min === s.max ? pz(s.min) : `${pz(s.min)} – ${pz(s.max)}`;
  };
  const z = (feld) => {
    const s = spanne(ls.map((l) => l.zeit?.[feld]));
    if (!s) return '–';
    return s.min === s.max ? `${s.min}` : `${s.min} – ${s.max}`;
  };
  console.log(
    `| ${modell} | ${ls[0].ort} | ${q('trefferquoteGefahr')} | ${q('krisenTrefferquote')} | ` +
      `${q('durchlassquoteHarmlos')} | ${z('median')} | ${z('p90')} |`,
  );
}

console.log(`\nMaschine: ${laeufe[0].maschine}`);
console.log('\nQualität sollte kaum streuen (gleiches Korpus, Temperatur 0); tut sie es doch, ist das');
console.log('selbst ein Befund. Zeiten streuen auf einer mitbenutzten Maschine erwartbar stark.\n');
