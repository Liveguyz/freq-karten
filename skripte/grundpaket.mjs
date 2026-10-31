#!/usr/bin/env node
/**
 * grundpaket.mjs — Schriften und Symbole für die Karte ohne Netz.
 *
 *   node skripte/grundpaket.mjs --aus <ordner>
 *       → <ordner>/fonts/<Schrift>/<von>-<bis>.pbf   + fonts/OFL.txt
 *         <ordner>/sprites/<name>.json|.png|@2x.json|@2x.png + sprites/LICENSE.txt
 *
 * Eine Länderdatei (.pmtiles) enthält nur die Kartenstücke. Straßennamen
 * brauchen Schriften (glyphs), Symbole die Sprite-Bilder. Online kommen beide
 * von OpenFreeMap; offline braucht das Handy eine Kopie. Welche: karten.json
 * „grund“ (genau die Schriften und das Sprite, die die OpenFreeMap-Stile
 * nennen). Geholt mit eigener Kennung, eine Datei nach der anderen (rund 30
 * kleine Dateien — keine Kartenstücke).
 *
 * Lizenzen reisen mit: die Noto-Glyphen stehen unter der SIL OFL 1.1 (der
 * Text muss beim Weitergeben dabei sein), das Sprite unter MIT mit Maki-Icons
 * (CC0) — lizenzen/OFL-Noto-Sans.txt und lizenzen/SPRITE.txt.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const ERLAUBTER_HOST = 'tiles.openfreemap.org';
const KENNUNG = 'freq-karten-grundpaket (+https://github.com/Liveguyz/freq-karten)';
const SCHRIFT_RE = /^[A-Za-z0-9 ]{1,60}$/;
const BEREICH_RE = /^\d{1,5}-\d{1,5}$/;

/** karten.json „grund“ prüfen; nur Adressen bei OpenFreeMap. */
export function grundLesen(grund) {
  for (const adresse of [grund?.glyphs, grund?.sprite]) {
    if (typeof adresse !== 'string' || new URL(adresse.replace(/[{}]/g, '')).host !== ERLAUBTER_HOST) {
      throw new Error(`Adresse außerhalb von ${ERLAUBTER_HOST}: ${adresse}`);
    }
  }
  if (!grund.glyphs.includes('{fontstack}') || !grund.glyphs.includes('{range}')) throw new Error('glyphs ohne {fontstack}/{range}');
  if (!Array.isArray(grund.schriften) || !grund.schriften.length || !grund.schriften.every(s => SCHRIFT_RE.test(s))) {
    throw new Error('schriften ungültig');
  }
  if (!Array.isArray(grund.bereiche) || !grund.bereiche.every(b => BEREICH_RE.test(b))) throw new Error('bereiche ungültig');
  return grund;
}

export const glyphUrl = (vorlage, schrift, bereich) =>
  vorlage.replace('{fontstack}', encodeURIComponent(schrift)).replace('{range}', bereich);

/** Die vier Dateien, die MapLibre zu einer Sprite-Adresse lädt (1x und 2x). */
export const spriteDateien = name => [`${name}.json`, `${name}.png`, `${name}@2x.json`, `${name}@2x.png`];

async function holen(url) {
  const antwort = await fetch(url, { headers: { 'User-Agent': KENNUNG } });
  if (!antwort.ok) return { status: antwort.status, daten: null };
  return { status: antwort.status, daten: Buffer.from(await antwort.arrayBuffer()) };
}

async function main(aus) {
  const konfig = JSON.parse(readFileSync(join(HIER, '..', 'karten.json'), 'utf8'));
  const { glyphs, sprite, schriften, bereiche } = grundLesen(konfig.grund);
  let anzahl = 0;
  for (const schrift of schriften) {
    for (const bereich of bereiche) {
      const { status, daten } = await holen(glyphUrl(glyphs, schrift, bereich));
      if (!daten) {
        // Nicht jede Schrift hat jeden Bereich — fehlt einer, bleibt er leer.
        if (status === 404) { console.warn(`[grund] ${schrift} ${bereich}: 404, übersprungen`); continue; }
        throw new Error(`${schrift} ${bereich}: HTTP ${status}`);
      }
      const ziel = join(aus, 'fonts', schrift, `${bereich}.pbf`);
      mkdirSync(dirname(ziel), { recursive: true });
      writeFileSync(ziel, daten);
      anzahl += 1;
    }
  }
  const basis = sprite.slice(0, sprite.lastIndexOf('/') + 1);
  const name = sprite.slice(sprite.lastIndexOf('/') + 1);
  for (const datei of spriteDateien(name)) {
    const { status, daten } = await holen(basis + datei);
    if (!daten) throw new Error(`Sprite ${datei}: HTTP ${status}`);
    const ziel = join(aus, 'sprites', datei);
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, daten);
    anzahl += 1;
  }
  copyFileSync(join(HIER, '..', 'lizenzen', 'OFL-Noto-Sans.txt'), join(aus, 'fonts', 'OFL.txt'));
  copyFileSync(join(HIER, '..', 'lizenzen', 'SPRITE.txt'), join(aus, 'sprites', 'LICENSE.txt'));
  console.log(`[grund] ${anzahl} Dateien + 2 Lizenztexte, Schriften: ${schriften.join(' | ')}, Sprite: ${name}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--aus');
  const aus = i > 0 ? process.argv[i + 1] : '';
  if (!aus) {
    console.error('Aufruf: grundpaket.mjs --aus <ordner>');
    process.exit(1);
  }
  main(aus).catch(e => {
    console.error(`[grund] Fehler: ${e.message}`);
    process.exit(1);
  });
}
