#!/usr/bin/env node
/**
 * stand.mjs — stand.json im Bucket (Cloudflare R2).
 *
 * Im Bucket läuft kein Programm: die Bau-Jobs laden nur
 * ihre .pmtiles hoch und legen je Gebiet und Variante eine kleine Meldung
 * (meta.json) an den Lauf. Danach führt EIN Job alle Meldungen mit der
 * bisherigen stand.json zusammen — so überschreibt kein Job den Eintrag eines
 * anderen — und räumt alte Fassungen weg.
 *
 *   node stand.mjs zusammenfuehren --alt <stand.json|-> --meldungen <ordner> --variante leicht|voll --aus <neu.json>
 *   node stand.mjs aufraeumen --objekte <list-objects.json> --stand <stand.json> --praefix karten/v1/leicht/ --variante leicht [--gebiete gebiete.json] --aus <loeschen.txt>
 *   node stand.mjs meldung --land <id> --variante leicht|voll --datei <name> --bytes <n> --sha256 <hex> --kopf <json> --aus <meta.json>
 *
 * Format (die FREQ-App und jeder andere Nutzer lesen es gleich): {version,
 * laender: {<land>: {datei, bytes, sha256, stand, grenzen, maxzoom}}, grund,
 * lizenz, erzeugt}. In der Leicht-stand.json heißen die Dateien
 * „<land>/<land>-leicht-<stempel>.pmtiles" (relativ zu …/v1/leicht/).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAND_RE = /^[a-z][a-z-]{1,40}$/;
const STEMPEL = '\\d{8}T\\d{6}Z';
const SHA_RE = /^[0-9a-f]{64}$/;

/** Wer die Dateien holen kann, soll die Lizenz sehen. */
export const LIZENZ = {
  daten: '© OpenStreetMap-Mitwirkende, ODbL 1.0 — https://www.openstreetmap.org/copyright',
  schema: '© OpenMapTiles, CC BY 4.0 — https://www.openmaptiles.org/',
  gebaut: 'freq-karten: Planetiler aus Geofabrik-Auszügen — https://github.com/Liveguyz/freq-karten',
};

/** Der Dateiname einer Fassung („austria-leicht-20261102T024100Z.pmtiles"). */
export const dateiMuster = (land, variante) =>
  new RegExp(`^${land.replace(/[-]/g, '\\-')}${variante === 'leicht' ? '-leicht' : ''}-${STEMPEL}\\.pmtiles$`);

/** Eine Meldung eines Bau-Jobs prüfen; Unbrauchbares wirft (der Job soll es merken). */
export function meldungLesen(m) {
  if (!m || typeof m !== 'object') throw new Error('Meldung leer');
  if (!LAND_RE.test(m.land)) throw new Error(`Meldung: Land ungültig: ${m.land}`);
  if (m.variante !== 'leicht' && m.variante !== 'voll') throw new Error(`Meldung: Variante ungültig: ${m.variante}`);
  const name = String(m.datei ?? '').split('/').pop();
  if (m.datei !== `${m.land}/${name}` || !dateiMuster(m.land, m.variante).test(name)) {
    throw new Error(`Meldung: Datei ungültig: ${m.datei}`);
  }
  if (!Number.isInteger(m.bytes) || m.bytes <= 0) throw new Error('Meldung: bytes ungültig');
  if (!SHA_RE.test(m.sha256)) throw new Error('Meldung: sha256 ungültig');
  if (!Number.isFinite(Date.parse(m.stand))) throw new Error('Meldung: stand ungültig');
  const g = m.grenzen;
  if (!Array.isArray(g) || g.length !== 4 || !g.every(Number.isFinite)) throw new Error('Meldung: grenzen ungültig');
  return {
    land: m.land,
    variante: m.variante,
    eintrag: { datei: m.datei, bytes: m.bytes, sha256: m.sha256, stand: m.stand, grenzen: g, maxzoom: m.maxzoom },
  };
}

/**
 * Bisherige stand.json + neue Meldungen → neue stand.json. Nur Meldungen der
 * passenden Variante; eine neuere Fassung ersetzt die alte, andere Länder
 * bleiben. `alt` null = es gab noch keine (der Aufrufer unterscheidet „gibt
 * es nicht" von „nicht lesbar" — sonst wäre nach einem Netzfehler die ganze
 * Liste weg).
 */
export function zusammenfuehren(alt, meldungen, variante, jetzt = new Date()) {
  const laender = { ...(alt && typeof alt.laender === 'object' && alt.laender ? alt.laender : {}) };
  for (const roh of meldungen) {
    const m = meldungLesen(roh);
    if (m.variante !== variante) continue;
    const bisher = laender[m.land];
    if (bisher && Date.parse(bisher.stand) > Date.parse(m.eintrag.stand)) continue;
    laender[m.land] = m.eintrag;
  }
  return {
    version: 1,
    laender,
    grund: variante === 'voll' ? (alt?.grund ?? null) : null,
    lizenz: LIZENZ,
    erzeugt: jetzt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

/**
 * Welche Objekte weg können: Fassungen unter `praefix<land>/` (mit
 * `nurGebiete` nur dieser Gebiete), die stand.json
 * nicht mehr nennt und die älter als `halteStunden` sind — ein Handy, das die
 * alte Fassung gerade lädt, soll fertig werden (Fortsetzen über Range). Nur
 * Namen nach unserem Muster; alles andere im Bucket bleibt unberührt.
 */
export function aufraeumen(objekte, stand, praefix, variante, jetzt = new Date(), halteStunden = 48, nurGebiete = null) {
  const genannt = new Set(Object.values(stand?.laender ?? {}).map(e => `${praefix}${e.datei}`));
  if (variante === 'voll' && stand?.grund?.datei) genannt.add(`${praefix}${stand.grund.datei}`);
  const grenze = jetzt.getTime() - halteStunden * 3_600_000;
  const weg = [];
  for (const o of objekte ?? []) {
    const key = String(o?.Key ?? '');
    if (!key.startsWith(praefix) || genannt.has(key)) continue;
    const rest = key.slice(praefix.length).split('/');
    if (rest.length !== 2) continue;
    const [land, name] = rest;
    const passt =
      land === 'grund'
        ? variante === 'voll' && new RegExp(`^grund-${STEMPEL}\\.zip$`).test(name)
        : LAND_RE.test(land) && dateiMuster(land, variante).test(name);
    if (!passt) continue;
    // Nur, was dieses Repo selbst baut (gebiete.json): andere Gebiete im
    // selben Bucket gehören einem anderen Bau und bleiben unberührt.
    if (nurGebiete && land !== 'grund' && !nurGebiete.has(land)) continue;
    const zeit = Date.parse(o.LastModified);
    if (Number.isFinite(zeit) && zeit < grenze) weg.push(key);
  }
  return weg;
}

/** Grundpaket in stand.json eintragen (der Stand-Job lädt es hoch). */
export function grundEintragen(stand, datei, bytes, sha256, jetzt = new Date()) {
  if (!new RegExp(`^grund/grund-${STEMPEL}\\.zip$`).test(datei)) throw new Error(`Grundpaket: Datei ungültig: ${datei}`);
  if (!Number.isInteger(bytes) || bytes <= 0 || !SHA_RE.test(sha256)) throw new Error('Grundpaket: Größe oder sha256 ungültig');
  return { ...stand, grund: { datei, bytes, sha256, stand: jetzt.toISOString().replace(/\.\d{3}Z$/, 'Z') } };
}

/** Braucht das Grundpaket einen neuen Stand? Fehlt es oder ist älter als 30 Tage. */
export const grundFaellig = (stand, jetzt = new Date()) =>
  !stand?.grund?.stand || jetzt.getTime() - Date.parse(stand.grund.stand) > 30 * 86_400_000;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [befehl, ...args] = process.argv.slice(2);
    const arg = name => {
      const i = args.indexOf(name);
      if (i < 0 || args[i + 1] === undefined) throw new Error(`${name} fehlt`);
      return args[i + 1];
    };
    const lies = pfad => (pfad === '-' ? null : JSON.parse(readFileSync(pfad, 'utf8')));
    if (befehl === 'zusammenfuehren') {
      const ordner = arg('--meldungen');
      const meldungen = [];
      for (const eintrag of readdirSync(ordner, { recursive: true })) {
        if (String(eintrag).endsWith('.json')) meldungen.push(JSON.parse(readFileSync(join(ordner, String(eintrag)), 'utf8')));
      }
      const neu = zusammenfuehren(lies(arg('--alt')), meldungen, arg('--variante'));
      writeFileSync(arg('--aus'), `${JSON.stringify(neu, null, 2)}\n`);
      process.stdout.write(`${Object.keys(neu.laender).length}\n`);
    } else if (befehl === 'aufraeumen') {
      const liste = lies(arg('--objekte'));
      const gi = args.indexOf('--gebiete');
      const nur = gi >= 0 ? new Set(lies(args[gi + 1]).laender.flatMap(l => l.gebiete.map(g => g.id))) : null;
      // Ohne Objekte antwortet aws mit {} (kein Contents) — dann gibt es nichts aufzuräumen.
      const weg = aufraeumen(Array.isArray(liste) ? liste : (liste?.Contents ?? []), lies(arg('--stand')), arg('--praefix'), arg('--variante'), new Date(), 48, nur);
      writeFileSync(arg('--aus'), weg.map(k => `${k}\n`).join(''));
      process.stdout.write(`${weg.length}\n`);
    } else if (befehl === 'meldung') {
      const kopf = JSON.parse(arg('--kopf'));
      const land = arg('--land');
      const meldung = {
        land,
        variante: arg('--variante'),
        datei: `${land}/${arg('--datei')}`,
        bytes: Number(arg('--bytes')),
        sha256: arg('--sha256'),
        stand: arg('--stand'),
        grenzen: kopf.grenzen,
        maxzoom: kopf.maxzoom,
      };
      meldungLesen(meldung);
      writeFileSync(arg('--aus'), `${JSON.stringify(meldung)}\n`);
    } else if (befehl === 'grund') {
      const stand = lies(arg('--stand')) ?? zusammenfuehren(null, [], 'voll');
      const neu = grundEintragen(stand, arg('--datei'), Number(arg('--bytes')), arg('--sha256'));
      writeFileSync(arg('--aus'), `${JSON.stringify(neu, null, 2)}\n`);
    } else if (befehl === 'grund-faellig') {
      process.stdout.write(`${grundFaellig(lies(arg('--stand'))) ? 'ja' : 'nein'}\n`);
    } else {
      throw new Error('Aufruf: siehe Kopf von stand.mjs');
    }
  } catch (e) {
    process.stderr.write(`[stand] ${e.message}\n`);
    process.exit(1);
  }
}
