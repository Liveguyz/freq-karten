// Tests für skripte/stand.mjs — laufen mit: node --test 'test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aufraeumen,
  dateiMuster,
  grundEintragen,
  grundFaellig,
  meldungLesen,
  zusammenfuehren,
} from '../skripte/stand.mjs';

const SHA = 'c'.repeat(64);
const meldung = (land, variante, stempel, extra = {}) => ({
  land,
  variante,
  datei: `${land}/${land}${variante === 'leicht' ? '-leicht' : ''}-${stempel}.pmtiles`,
  bytes: 1000,
  sha256: SHA,
  stand: `${stempel.slice(0, 4)}-${stempel.slice(4, 6)}-${stempel.slice(6, 8)}T${stempel.slice(9, 11)}:${stempel.slice(11, 13)}:${stempel.slice(13, 15)}Z`,
  grenzen: [9.5, 46.3, 17.2, 49.1],
  maxzoom: variante === 'leicht' ? 13 : 14,
  ...extra,
});

test('Meldungen: nur gültige Namen, Varianten, Prüfsummen', () => {
  assert.equal(meldungLesen(meldung('austria', 'leicht', '20261102T024100Z')).variante, 'leicht');
  assert.throws(() => meldungLesen(meldung('austria', 'leicht', '20261102T024100Z', { datei: 'austria/austria-20261102T024100Z.pmtiles' })), /Datei/);
  assert.throws(() => meldungLesen(meldung('austria', 'voll', '20261102T024100Z', { datei: '../austria-20261102T024100Z.pmtiles' })), /Datei/);
  assert.throws(() => meldungLesen(meldung('austria', 'schwer', '20261102T024100Z')), /Variante/);
  assert.throws(() => meldungLesen(meldung('austria', 'voll', '20261102T024100Z', { sha256: 'x' })), /sha256/);
  assert.throws(() => meldungLesen(meldung('austria', 'voll', '20261102T024100Z', { bytes: 0 })), /bytes/);
  assert.throws(() => meldungLesen(meldung('Austria', 'voll', '20261102T024100Z')), /Land/);
  assert.ok(dateiMuster('us-new-york', 'leicht').test('us-new-york-leicht-20261102T024100Z.pmtiles'));
  assert.ok(!dateiMuster('us-new-york', 'voll').test('us-new-york-leicht-20261102T024100Z.pmtiles'));
});

test('Zusammenführen: neue Länder dazu, neuere ersetzen, andere bleiben, nur die eigene Variante', () => {
  const alt = zusammenfuehren(null, [meldung('austria', 'voll', '20261002T024100Z'), meldung('germany', 'voll', '20261002T024100Z')], 'voll');
  assert.deepEqual(Object.keys(alt.laender).sort(), ['austria', 'germany']);
  assert.equal(alt.grund, null);
  assert.equal(alt.lizenz.daten.includes('ODbL'), true);
  const neu = zusammenfuehren(
    { ...alt, grund: { datei: 'grund/grund-20261001T000000Z.zip' } },
    [meldung('austria', 'voll', '20261102T024100Z'), meldung('austria', 'leicht', '20261102T024100Z'), meldung('germany', 'voll', '20260901T000000Z')],
    'voll',
  );
  assert.equal(neu.laender.austria.datei, 'austria/austria-20261102T024100Z.pmtiles');
  // Eine ältere Meldung (z. B. ein verspäteter Job) überschreibt nichts.
  assert.equal(neu.laender.germany.stand, alt.laender.germany.stand);
  assert.equal(neu.grund.datei, 'grund/grund-20261001T000000Z.zip');
  const leicht = zusammenfuehren(null, [meldung('austria', 'leicht', '20261102T024100Z')], 'leicht');
  assert.equal(leicht.laender.austria.datei, 'austria/austria-leicht-20261102T024100Z.pmtiles');
  assert.equal(leicht.grund, null);
  assert.throws(() => zusammenfuehren(null, [{ land: 'x' }], 'voll'));
});

test('Aufräumen: nur unsere alten, nicht genannten Fassungen nach 48 Stunden', () => {
  const jetzt = new Date('2026-11-05T00:00:00Z');
  const stand = zusammenfuehren(null, [meldung('austria', 'voll', '20261102T024100Z')], 'voll');
  stand.grund = { datei: 'grund/grund-20261101T000000Z.zip' };
  const P = 'karten/v1/';
  const objekte = [
    { Key: `${P}stand.json`, LastModified: '2026-10-01T00:00:00Z' },
    { Key: `${P}austria/austria-20261102T024100Z.pmtiles`, LastModified: '2026-11-02T03:00:00Z' },
    { Key: `${P}austria/austria-20261002T024100Z.pmtiles`, LastModified: '2026-10-02T03:00:00Z' },
    { Key: `${P}austria/austria-20261104T120000Z.pmtiles`, LastModified: '2026-11-04T12:00:00Z' },
    { Key: `${P}grund/grund-20261001T000000Z.zip`, LastModified: '2026-10-01T00:00:00Z' },
    { Key: `${P}grund/grund-20261101T000000Z.zip`, LastModified: '2026-11-01T00:00:00Z' },
    { Key: `${P}leicht/austria/austria-leicht-20261002T024100Z.pmtiles`, LastModified: '2026-10-02T03:00:00Z' },
    { Key: `${P}austria/notizen.txt`, LastModified: '2026-01-01T00:00:00Z' },
  ];
  assert.deepEqual(aufraeumen(objekte, stand, P, 'voll', jetzt), [
    `${P}austria/austria-20261002T024100Z.pmtiles`,
    `${P}grund/grund-20261001T000000Z.zip`,
  ]);
  const leichtStand = zusammenfuehren(null, [], 'leicht');
  assert.deepEqual(aufraeumen(objekte, leichtStand, `${P}leicht/`, 'leicht', jetzt), [`${P}leicht/austria/austria-leicht-20261002T024100Z.pmtiles`]);
});

test('Grundpaket: eintragen geprüft, fällig nach 30 Tagen', () => {
  const jetzt = new Date('2026-11-05T00:00:00Z');
  const stand = grundEintragen(zusammenfuehren(null, [], 'voll'), 'grund/grund-20261105T000000Z.zip', 1234, SHA, jetzt);
  assert.equal(stand.grund.stand, '2026-11-05T00:00:00Z');
  assert.equal(grundFaellig(stand, jetzt), false);
  assert.equal(grundFaellig(stand, new Date('2026-12-06T00:00:00Z')), true);
  assert.equal(grundFaellig({ laender: {} }, jetzt), true);
  assert.throws(() => grundEintragen(stand, 'grund/../x.zip', 1, SHA), /ungültig/);
});

test('Aufräumen: mit gebiete.json nur die eigenen Gebiete, fremde bleiben', () => {
  const jetzt = new Date('2026-11-05T00:00:00Z');
  const stand = zusammenfuehren(null, [], 'voll');
  const P = 'karten/v1/';
  const objekte = [
    { Key: `${P}luxembourg/luxembourg-20261002T024100Z.pmtiles`, LastModified: '2026-10-02T03:00:00Z' },
    { Key: `${P}japan/japan-20261002T024100Z.pmtiles`, LastModified: '2026-10-02T03:00:00Z' },
  ];
  assert.deepEqual(aufraeumen(objekte, stand, P, 'voll', jetzt, 48, new Set(['luxembourg'])), [
    `${P}luxembourg/luxembourg-20261002T024100Z.pmtiles`,
  ]);
  assert.equal(aufraeumen(objekte, stand, P, 'voll', jetzt).length, 2);
});
