#!/usr/bin/env node
/**
 * plan.mjs — was der Workflow baut und mit welchen Schaltern.
 *
 *   node skripte/plan.mjs --matrix [--laender <eingabe>] [--varianten beide|leicht|voll]
 *       → {"include":[{"land":"germany","gebiete":"baden-wuerttemberg:europe/germany/baden-wuerttemberg,…","mb":4743,"minuten":…},…]}
 *         Ein Eintrag je Land (= ein Job), die größten zuerst.
 *   node skripte/plan.mjs --varianten beide|leicht|voll      → "voll leicht"
 *   node skripte/plan.mjs --wert planetiler
 *   node skripte/plan.mjs --wert maxzoom|weglassen|zusatz --variante voll|leicht
 *   node skripte/plan.mjs --rechnung [--varianten …]        → Markdown: geschätzte Bauzeit
 *
 * <eingabe>: leer = alle Länder aus gebiete.json; sonst kommagetrennt Länder
 * („germany“), ISO-Codes („DE“, „lu“) oder einzelne Teilgebiete („bayern“).
 * Alles wird gegen gebiete.json geprüft — nichts aus der Eingabe geht
 * ungeprüft in die Shell.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const lies = name => JSON.parse(readFileSync(join(HIER, '..', name), 'utf8'));

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
const PFAD_RE = /^[a-z]+(\/[a-z0-9-]+){1,2}$/;
const ZUSATZ_RE = /^--[a-z_]+=[A-Za-z0-9_.,-]+$/;
const EBENE_RE = /^[a-z_]+$/;

/** gebiete.json prüfen: eindeutige Kennungen, saubere Pfade. Wirft bei Fehlern. */
export function gebieteLesen(daten) {
  const laender = daten?.laender;
  if (!Array.isArray(laender) || laender.length === 0) throw new Error('gebiete.json: keine Länder');
  const gesehen = new Set();
  for (const l of laender) {
    if (!ID_RE.test(l.id) || !/^[A-Z]{2}$/.test(l.iso)) throw new Error(`gebiete.json: Land ungültig: ${l.id}`);
    if (!Array.isArray(l.gebiete) || l.gebiete.length === 0) throw new Error(`gebiete.json: ${l.id} ohne Gebiete`);
    for (const g of l.gebiete) {
      if (!ID_RE.test(g.id)) throw new Error(`gebiete.json: Gebiet ungültig: ${g.id}`);
      if (!PFAD_RE.test(g.geofabrik)) throw new Error(`gebiete.json: Geofabrik-Pfad ungültig: ${g.geofabrik}`);
      if (!Number.isFinite(g.mb) || g.mb <= 0) throw new Error(`gebiete.json: mb ungültig: ${g.id}`);
      if (gesehen.has(g.id)) throw new Error(`gebiete.json: Gebiet doppelt: ${g.id}`);
      gesehen.add(g.id);
    }
  }
  return laender;
}

/** Die Eingabe → Länder mit den gewählten Gebieten (ein Teilgebiet allein bleibt ein Job seines Landes). */
export function auswahl(laender, eingabe = '') {
  const woerter = [...new Set(String(eingabe).split(',').map(s => s.trim()).filter(Boolean))];
  if (woerter.length === 0) return laender.map(l => ({ ...l }));
  const gewaehlt = new Map();
  const dazu = (land, gebiete) => {
    const bisher = gewaehlt.get(land.id) ?? new Set();
    for (const g of gebiete) bisher.add(g.id);
    gewaehlt.set(land.id, bisher);
  };
  for (const wort of woerter) {
    const klein = wort.toLowerCase();
    const gross = wort.toUpperCase();
    const treffer = laender.filter(l => l.id === klein || l.iso === gross);
    if (treffer.length > 0) {
      for (const l of treffer) dazu(l, l.gebiete);
      continue;
    }
    const land = laender.find(l => l.gebiete.some(g => g.id === klein));
    if (!land) throw new Error(`Unbekanntes Land oder Gebiet: ${JSON.stringify(wort)} (siehe gebiete.json)`);
    dazu(land, land.gebiete.filter(g => g.id === klein));
  }
  return laender
    .filter(l => gewaehlt.has(l.id))
    .map(l => ({ ...l, gebiete: l.gebiete.filter(g => gewaehlt.get(l.id).has(g.id)) }));
}

export function variantenAus(eingabe = 'beide') {
  const e = String(eingabe || 'beide').trim();
  if (e === 'beide') return ['voll', 'leicht'];
  if (e === 'voll' || e === 'leicht') return [e];
  throw new Error(`Variante unbekannt: ${JSON.stringify(eingabe)} (beide, leicht, voll)`);
}

/** Geschätzte Minuten eines Jobs (Runner, Beigaben, je Gebiet und Variante). */
export function minuten(land, varianten, zeit) {
  let summe = zeit.minuten_je_job;
  for (const g of land.gebiete) {
    for (const v of varianten) summe += zeit.minuten_je_lauf + (g.mb / 1024) * zeit.minuten_je_gb[v];
  }
  return Math.ceil(summe);
}

export function matrix(laender, varianten, zeit) {
  const include = laender
    .map(l => ({
      land: l.id,
      gebiete: l.gebiete.map(g => `${g.id}:${g.geofabrik}`).join(','),
      mb: l.gebiete.reduce((s, g) => s + g.mb, 0),
      minuten: minuten(l, varianten, zeit),
    }))
    .sort((a, b) => b.mb - a.mb || a.land.localeCompare(b.land));
  return { include };
}

/** Ein Wert für die Kommandozeile, geprüft (er geht ohne Anführungszeichen in die Shell). */
export function wert(konfig, name, variante) {
  if (name === 'planetiler') {
    if (!/^\d+\.\d+\.\d+$/.test(konfig.planetiler)) throw new Error('planetiler: Version ungültig');
    return konfig.planetiler;
  }
  const v = konfig.varianten?.[variante];
  if (!v) throw new Error(`Variante unbekannt: ${variante}`);
  if (name === 'maxzoom') {
    if (!Number.isInteger(v.maxzoom) || v.maxzoom < 0 || v.maxzoom > 15) throw new Error('maxzoom ungültig');
    return String(v.maxzoom);
  }
  if (name === 'weglassen') {
    if (!v.weglassen.every(e => EBENE_RE.test(e))) throw new Error('weglassen: Ebene ungültig');
    return v.weglassen.join(',');
  }
  if (name === 'zusatz') {
    if (!v.zusatz.every(z => ZUSATZ_RE.test(z))) throw new Error('zusatz: nur --name=wert');
    return v.zusatz.join(' ');
  }
  throw new Error(`Wert unbekannt: ${name}`);
}

/** Markdown für die Zusammenfassung: Jobs, GB, geschätzte Minuten und Dauer bei max-parallel. */
export function rechnung(laender, varianten, zeit, parallel = 2) {
  const m = matrix(laender, varianten, zeit).include;
  const summe = m.reduce((s, j) => s + j.minuten, 0);
  const gb = m.reduce((s, j) => s + j.mb, 0) / 1024;
  // Grobe Wanduhr: Jobs, größte zuerst, auf `parallel` Plätze verteilt.
  const plaetze = Array(parallel).fill(0);
  for (const j of m) plaetze[plaetze.indexOf(Math.min(...plaetze))] += j.minuten;
  const wand = Math.max(...plaetze);
  const fmt = n => `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')} min`;
  return [
    `| | |`,
    `|---|---|`,
    `| Länder (Jobs) | ${m.length} |`,
    `| Gebiete | ${laender.reduce((s, l) => s + l.gebiete.length, 0)} |`,
    `| Auszüge | ${gb.toFixed(1)} GB |`,
    `| Varianten | ${varianten.join(', ')} |`,
    `| Runner-Minuten (Schätzung) | ~${summe} |`,
    `| Dauer bei ${parallel} Jobs gleichzeitig | ~${fmt(wand)} |`,
    `| längster Job | ${m[0] ? `${m[0].land}, ~${m[0].minuten} min` : '—'} |`,
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = process.argv.slice(2);
    const arg = (name, standard) => {
      const i = args.indexOf(name);
      return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : standard;
    };
    const konfig = lies('karten.json');
    const laender = gebieteLesen(lies('gebiete.json'));
    if (args.includes('--matrix')) {
      const v = variantenAus(arg('--varianten', 'beide'));
      process.stdout.write(`${JSON.stringify(matrix(auswahl(laender, arg('--laender', '')), v, konfig.zeit))}\n`);
    } else if (args.includes('--rechnung')) {
      const v = variantenAus(arg('--varianten', 'beide'));
      process.stdout.write(`${rechnung(auswahl(laender, arg('--laender', '')), v, konfig.zeit, Number(arg('--parallel', '2')))}\n`);
    } else if (args.includes('--wert')) {
      process.stdout.write(`${wert(konfig, arg('--wert'), arg('--variante'))}\n`);
    } else if (args.includes('--varianten')) {
      process.stdout.write(`${variantenAus(arg('--varianten', 'beide')).join(' ')}\n`);
    } else {
      throw new Error('Aufruf: siehe Kopf von skripte/plan.mjs');
    }
  } catch (e) {
    process.stderr.write(`[plan] ${e.message}\n`);
    process.exit(1);
  }
}
