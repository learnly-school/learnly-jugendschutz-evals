#!/usr/bin/env node
/**
 * Legt alle Laeufe aus ergebnisse/ nebeneinander und zeigt, wo sie auseinandergehen.
 *
 *   node src/vergleich.mjs                 # Tabelle und Befunde
 *   node src/vergleich.mjs --kurve         # zusaetzlich die Schwellen-Kurven
 *
 * Die interessanten Zeilen sind nicht die, bei denen alle richtig liegen, sondern die, bei denen
 * sich die Modelle widersprechen: dort steckt der Unterschied zwischen den Bauweisen.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { tabelle, geschwindigkeit } from './auswertung.mjs';

const WURZEL = new URL('..', import.meta.url);
const KORPUS = JSON.parse(readFileSync(new URL('korpus/korpus.json', WURZEL), 'utf8'));

const berichte = readdirSync(new URL('ergebnisse/', WURZEL))
  .filter((d) => d.endsWith('.json'))
  .map((d) => JSON.parse(readFileSync(new URL(`ergebnisse/${d}`, WURZEL), 'utf8')))
  .sort((a, b) => a.modell.localeCompare(b.modell));

if (!berichte.length) {
  console.error('Keine Ergebnisse in ergebnisse/. Erst einen Lauf machen.');
  process.exit(1);
}

console.log(`\n## Qualitaet\n\nKorpus ${KORPUS.version}, ${KORPUS.faelle.length} Faelle\n`);
console.log(tabelle(berichte));

console.log('\n## Geschwindigkeit\n');
console.log(geschwindigkeit(berichte));
console.log(
  '\nNur Zeilen mit demselben Ort sind vergleichbar. Eine gehostete API gegen ein Modell auf dem\n' +
    'eigenen Rechner zu stellen misst Rechenzentrum und Leitung, nicht das Modell.',
);

console.log('\n## Herkunft\n');
console.log('| Modell | Bauweise | Betrieb |');
console.log('| --- | --- | --- |');
for (const b of berichte) console.log(`| ${b.modell} | ${b.bauweise} | ${b.anbieter} |`);

const urteil = (b, id) => b.messungen.find((m) => m.id === id)?.blockiert;

// Faelle, bei denen die Modelle uneins sind. Der Rest ist langweilig.
const uneinig = KORPUS.faelle.filter((c) => new Set(berichte.map((b) => urteil(b, c.id))).size > 1);

console.log(`\n## Uneinigkeit: ${uneinig.length} von ${KORPUS.faelle.length} Faellen\n`);
console.log(`| Fall | erwartet | ${berichte.map((b) => b.modell).join(' | ')} | Nachricht |`);
console.log(`| --- | --- | ${berichte.map(() => '---').join(' | ')} | --- |`);
for (const c of uneinig) {
  const soll = c.blockieren ? 'blocken' : 'durch';
  const zellen = berichte.map((b) => {
    const u = urteil(b, c.id);
    if (u === null || u === undefined) return '?';
    return u === c.blockieren ? (u ? '✓ blockt' : '✓ durch') : u ? '✗ blockt' : '✗ durch';
  });
  console.log(`| \`${c.id}\` | ${soll} | ${zellen.join(' | ')} | ${c.text.slice(0, 60)} |`);
}

// Faelle, die KEIN Modell richtig hat: die blinden Flecken der ganzen Gattung.
const alleFalsch = KORPUS.faelle.filter((c) => berichte.every((b) => urteil(b, c.id) !== c.blockieren));
console.log(`\n## Von keinem Modell richtig: ${alleFalsch.length} Faelle\n`);
for (const c of alleFalsch) {
  const art = c.blockieren ? `uebersehen (${c.kategorie}, ${c.stufe})` : c.falle ? 'Fehlalarm auf einer Falle' : 'Fehlalarm';
  console.log(`- \`${c.id}\` — ${art}: „${c.text}"`);
}

if (process.argv.includes('--kurve')) {
  for (const b of berichte.filter((x) => x.schwellenkurve)) {
    console.log(`\n## Schwellen-Kurve: ${b.modell}\n`);
    console.log('| Schwelle | Trefferquote Gefahr | davon Krise | Durchlassquote harmlos |');
    console.log('| ---: | ---: | ---: | ---: |');
    for (const p of b.schwellenkurve) {
      const z = (x) => (x === null ? '–' : `${(x * 100).toFixed(1)}%`);
      console.log(`| ${p.schwelle.toFixed(2)} | ${z(p.trefferquoteGefahr)} | ${z(p.krisenTrefferquote)} | ${z(p.durchlassquoteHarmlos)} |`);
    }
  }
}
console.log();
