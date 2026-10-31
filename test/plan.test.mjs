// Tests für skripte/plan.mjs und skripte/grundpaket.mjs — laufen mit: node --test 'test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { auswahl, gebieteLesen, matrix, rechnung, variantenAus, wert } from '../skripte/plan.mjs';
import { glyphUrl, grundLesen, spriteDateien } from '../skripte/grundpaket.mjs';

const lies = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const KONFIG = lies('karten.json');
const LAENDER = gebieteLesen(lies('gebiete.json'));

// EU-27 + Island, Norwegen + Vereinigtes Königreich; IC = Kanaren (Spanien).
const START = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'NO', 'GB'];

test('gebiete.json: alle Startländer, ohne Schweiz und Liechtenstein', () => {
  const iso = new Set(LAENDER.map(l => l.iso));
  for (const c of START) assert.ok(iso.has(c), `${c} fehlt`);
  for (const c of ['CH', 'LI']) assert.ok(!iso.has(c), `${c} darf nicht dabei sein`);
  for (const c of iso) assert.ok(START.includes(c) || c === 'IC', `${c} gehört nicht zur Startliste`);
});

test('leer = alle Länder, ein Job je Land, die größten zuerst', () => {
  const m = matrix(auswahl(LAENDER, ''), ['voll', 'leicht'], KONFIG.zeit).include;
  assert.equal(m.length, LAENDER.length);
  for (let i = 1; i < m.length; i++) assert.ok(m[i - 1].mb >= m[i].mb);
  const de = m.find(j => j.land === 'germany');
  assert.equal(de.gebiete.split(',').length, 16);
  assert.ok(de.gebiete.split(',').every(e => /^[a-z-]+:europe\/germany\/[a-z-]+$/.test(e)));
});

test('Eingabe: Land, ISO-Code, Teilgebiet; Groß/klein, Leerzeichen, Doppelte egal', () => {
  assert.deepEqual(auswahl(LAENDER, ' LU, luxembourg ,lu').map(l => l.id), ['luxembourg']);
  const by = auswahl(LAENDER, 'bayern,berlin');
  assert.equal(by.length, 1);
  assert.deepEqual(by[0].gebiete.map(g => g.id).sort(), ['bayern', 'berlin']);
  assert.equal(auswahl(LAENDER, 'DE')[0].gebiete.length, 16);
});

test('Unbekanntes oder Gesperrtes bricht ab, statt in die Shell zu gehen', () => {
  assert.throws(() => auswahl(LAENDER, 'switzerland'), /Unbekannt/);
  assert.throws(() => auswahl(LAENDER, 'CH'), /Unbekannt/);
  assert.throws(() => auswahl(LAENDER, 'liechtenstein'), /Unbekannt/);
  assert.throws(() => auswahl(LAENDER, 'austria;rm -rf /'), /Unbekannt/);
});

test('Varianten und Werte für die Kommandozeile sind geprüft', () => {
  assert.deepEqual(variantenAus('beide'), ['voll', 'leicht']);
  assert.deepEqual(variantenAus(''), ['voll', 'leicht']);
  assert.deepEqual(variantenAus('leicht'), ['leicht']);
  assert.throws(() => variantenAus('schwer'));
  assert.equal(wert(KONFIG, 'maxzoom', 'voll'), '14');
  assert.equal(wert(KONFIG, 'maxzoom', 'leicht'), '13');
  assert.match(wert(KONFIG, 'weglassen', 'leicht'), /building/);
  assert.match(wert(KONFIG, 'planetiler'), /^\d+\.\d+\.\d+$/);
  const boese = { ...KONFIG, varianten: { voll: { ...KONFIG.varianten.voll, zusatz: ['--x=1; rm -rf /'] } } };
  assert.throws(() => wert(boese, 'zusatz', 'voll'), /--name=wert/);
  // „leicht“ darf nie Straßen, Namen, Orte, Wasser oder Grenzen weglassen.
  for (const e of ['transportation', 'transportation_name', 'place', 'water', 'waterway', 'boundary']) {
    assert.ok(!KONFIG.varianten.leicht.weglassen.includes(e), e);
  }
});

test('Rechnung nennt Jobs, GB und Dauer', () => {
  const r = rechnung(LAENDER, ['voll', 'leicht'], KONFIG.zeit, 2);
  assert.match(r, /Länder \(Jobs\) \| 32 \|/);
  assert.match(r, /Dauer bei 2 Jobs gleichzeitig/);
});

test('Grundpaket: nur OpenFreeMap, saubere Schriftnamen, Lizenzen liegen bei', () => {
  const g = grundLesen(KONFIG.grund);
  assert.equal(glyphUrl(g.glyphs, 'Noto Sans Regular', '0-255'), 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf');
  assert.deepEqual(spriteDateien('ofm'), ['ofm.json', 'ofm.png', 'ofm@2x.json', 'ofm@2x.png']);
  assert.throws(() => grundLesen({ ...g, sprite: 'https://example.com/sprite' }), /außerhalb/);
  assert.throws(() => grundLesen({ ...g, schriften: ['../x'] }), /schriften/);
  assert.match(readFileSync(new URL('../lizenzen/OFL-Noto-Sans.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(readFileSync(new URL('../lizenzen/SPRITE.txt', import.meta.url), 'utf8'), /CC0/);
});
