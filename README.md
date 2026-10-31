# freq-karten

Offline-Vektorkarten für Europa, **eine Datei je Land**, frei für alle.

Dieses Repo baut jeden Monat aus OpenStreetMap-Daten eine [PMTiles](https://github.com/protomaps/PMTiles)-Datei je Gebiet und legt sie öffentlich ab. Gebaut wird mit [Planetiler](https://github.com/onthegomap/planetiler) im [OpenMapTiles](https://openmaptiles.org/)-Schema. Jede Karte, die dieses Schema versteht, kann die Dateien direkt zeigen, z. B. die Stile von [OpenFreeMap](https://openfreemap.org/) in MapLibre.

Die Dateien entstehen für die Offline-Karten der Navi-App **FREQ**. Sie sind aber ein gewöhnliches Open-Data-Angebot: Jeder darf sie laden und nutzen, solange er die Lizenzen unten einhält.

*English summary at the end.*

## Was gebaut wird

- **Länder:** EU, EWR und Vereinigtes Königreich, ohne Schweiz und Liechtenstein. Dazu gehören auch Norwegen, Island, die Azoren und die Kanaren (`gebiete.json`, 32 Länder, 73 Gebiete).
- **Teilgebiete:** Deutschland und Frankreich sind in die Teilgebiete von Geofabrik geteilt, also Bundesländer bzw. Regionen.
- **Zwei Varianten je Gebiet** (`karten.json`):

| Variante | Inhalt | Zoom | Größe (Beispiel Österreich) |
|---|---|---|---:|
| `voll` | alles, was eine OpenMapTiles-Karte zeichnet, ohne POI, Hausnummern und Gipfel | 0–14 | ~523 MB |
| `leicht` | Straßen, Orte, Wasser, Grenzen; ohne Gebäude, Landnutzung und Parks, vereinfacht; Namen nur in Landessprache, Deutsch und Englisch | 0–13 | ~55 MB |

- **Grundpaket:** ein kleines ZIP mit den Schriften (Noto Sans: Latein, Griechisch, Kyrillisch) und dem Sprite der OpenFreeMap-Stile, damit Beschriftungen und Symbole auch ohne Netz da sind. Die Lizenztexte liegen bei (`fonts/OFL.txt`, `sprites/LICENSE.txt`).

## Wo die Dateien liegen

Öffentlich unter `https://karten.freqconvoi.com/karten/v1/`:

```
karten/v1/stand.json                                  # Liste: voll
karten/v1/<gebiet>/<gebiet>-<JJJJMMTTThhmmssZ>.pmtiles
karten/v1/grund/grund-<stempel>.zip                  # Schriften + Sprite
karten/v1/leicht/stand.json                           # Liste: leicht
karten/v1/leicht/<gebiet>/<gebiet>-leicht-<stempel>.pmtiles
```

`stand.json` nennt je Gebiet die aktuelle Datei mit Größe, SHA-256, Stand, Grenzen und höchstem Zoom, dazu die Lizenz:

```json
{
  "version": 1,
  "laender": {
    "luxembourg": { "datei": "luxembourg/luxembourg-20261103T032300Z.pmtiles", "bytes": 31457280,
                    "sha256": "…", "stand": "2026-11-03T03:23:00Z", "grenzen": [5.73, 49.44, 6.53, 50.18], "maxzoom": 14 }
  },
  "grund": { "datei": "grund/grund-20261103T040000Z.zip", "bytes": 1500000, "sha256": "…", "stand": "…" },
  "lizenz": { "daten": "© OpenStreetMap-Mitwirkende, ODbL 1.0 — …", "schema": "© OpenMapTiles, CC BY 4.0 — …", "gebaut": "…" },
  "erzeugt": "…"
}
```

Eine Fassung ändert sich nie (eigener Name, `Cache-Control: immutable`). Ältere Fassungen bleiben nach dem Wechsel noch 48 Stunden liegen, damit ein angefangener Download fertig werden kann (HTTP-Range wird unterstützt). Die Gebietsnamen (`luxembourg`, `bayern`, `ile-de-france` …) sind die von Geofabrik.

Beispiel mit MapLibre: Datei laden, Quelle `openmaptiles` im Stil auf `pmtiles://file:///…/luxembourg-….pmtiles` (Native) bzw. `pmtiles://https://karten.freqconvoi.com/karten/v1/luxembourg/…` (Web, mit dem [pmtiles-Protokoll](https://docs.protomaps.com/pmtiles/maplibre)) setzen.

**Bitte fair nutzen:** Die Dateien liegen bei Cloudflare R2 und werden von einem kleinen Projekt bezahlt. Für eigene Apps mit vielen Nutzern bitte die Dateien selbst bauen (dieses Repo forken) oder spiegeln.

## Lizenzen

| Was | Lizenz | Pflicht für Nutzer |
|---|---|---|
| **Code und Konfiguration** in diesem Repo | [MIT](LICENSE) | Copyright-Hinweis behalten |
| **Kartendaten** in den `.pmtiles` | [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/), © OpenStreetMap-Mitwirkende | Sichtbar nennen: **„© OpenStreetMap-Mitwirkende“** mit Link auf <https://www.openstreetmap.org/copyright>. Abgeleitete Datenbanken, die man öffentlich weitergibt, wieder unter der ODbL anbieten. Keine technischen Sperren (DRM) ohne zusätzliche offene Fassung |
| **Schema** (Ebenen- und Feldnamen) | [OpenMapTiles](https://github.com/openmaptiles/openmaptiles), Schema/Design CC BY 4.0, Code BSD-3-Clause | Sichtbar nennen: **„© OpenMapTiles“** mit Link auf <https://openmaptiles.org/> |
| **Beigaben beim Bau**: Wasserflächen und Seemittellinien (aus OSM), Natural Earth | ODbL bzw. gemeinfrei | durch die OSM-Nennung abgedeckt |
| **Planetiler** (Werkzeug, wird nicht ausgeliefert) | [Apache-2.0](https://github.com/onthegomap/planetiler/blob/main/LICENSE) | — |
| **Schriften** im Grundpaket (Glyphen aus Noto Sans) | [SIL Open Font License 1.1](lizenzen/OFL-Noto-Sans.txt) | Lizenztext beim Weitergeben mitgeben (liegt im ZIP als `fonts/OFL.txt`) |
| **Sprite** im Grundpaket (OpenFreeMap-Stile, `ofm_f384`) | [MIT](https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md); Icons: Maki CC0 1.0, Pfeil gemeinfrei | Hinweis beim Weitergeben mitgeben (liegt im ZIP als `sprites/LICENSE.txt`, Text: [lizenzen/SPRITE.txt](lizenzen/SPRITE.txt)) |

Die Auszüge kommen von [Geofabrik](https://download.geofabrik.de/) (OSM-Daten, ODbL).

## Wie gebaut wird

Workflow `.github/workflows/karten.yml`:

1. **plan:** Tests (Node und Python), Secrets da?, die Matrix aus `gebiete.json` (ein Job je Land, die größten zuerst) und eine geschätzte Bauzeit in der Zusammenfassung.
2. **beigaben:** Planetiler und seine Beigaben (Wasserflächen, Natural Earth, ~1,4 GB) **einmal im Monat** holen und in den Actions-Cache legen.
3. **bauen** (je Land ein Job, **höchstens 2 gleichzeitig**, `fail-fast: false`): je Gebiet den Geofabrik-Auszug holen (MD5 prüfen, 20 s Pause zwischen zwei Auszügen), beide Varianten mit Planetiler bauen, nur Kacheln innerhalb der Umrisslinie (`.poly`), den PMTiles-Kopf prüfen (`skripte/pmtiles_kopf.py`), hochladen. Scheitert ein Gebiet, laufen die anderen weiter.
4. **stand** (einmal nach allen Bau-Jobs, auch wenn einer scheiterte): die Meldungen in `stand.json` führen (`skripte/stand.mjs`), das Grundpaket hochladen (monatlich, `skripte/grundpaket.mjs`), alte Fassungen der eigenen Gebiete nach 48 h löschen. `stand.json` wird nur **bedingt** ersetzt (`If-Match` auf den gelesenen ETag). Schreibt ein anderer Bau gleichzeitig in denselben Bucket, wird neu gelesen und zusammengeführt; kein Eintrag geht verloren.

**Wann:** am 3. jedes Monats um 03:23 UTC, und von Hand:

```sh
gh workflow run karten.yml -f laender=luxembourg -f probelauf=true   # nur bauen, Größen/Minuten melden
gh workflow run karten.yml -f laender=AT,bayern                      # bauen und hochladen
gh workflow run karten.yml                                           # alles
```

`laender` nimmt Länder (`germany`), ISO-Codes (`DE`) oder Teilgebiete (`bayern`). **Geschätzte Bauzeit für alles:** `node skripte/plan.mjs --rechnung` (steht auch in jeder Zusammenfassung).

### Secrets

Unter **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Inhalt |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare-Konto-Kennung (32 Zeichen) |
| `R2_ACCESS_KEY_ID` | Access Key ID eines R2-API-Tokens mit „Object Read & Write“, nur für den Bucket |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key dieses Tokens |
| `R2_BUCKET` | Name des Buckets |

Ohne Secrets: Der Monatslauf bricht sofort mit klarer Meldung ab und baut nichts. Ein Lauf von Hand baut und scheitert dann beim Hochladen mit klarer Meldung. Mit `probelauf=true` wird nur gebaut, und der Lauf bleibt grün.

### Selbst bauen (Fork)

Forken, eigenen R2-Bucket (oder einen anderen S3-Speicher; `AWS_ENDPOINT_URL` im Workflow anpassen) und die vier Secrets setzen. In `gebiete.json` die Gebiete anpassen. Ein öffentliches Repo hat unbegrenzte Actions-Minuten auf 4-Kern-Runnern; ganz Europa braucht einige Stunden Runner-Zeit im Monat.

Lokal (Java 21, ein kleines Land):

```sh
curl -LO https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar
curl -LO https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf
java -Xmx2g -jar planetiler.jar --download --osm-path=luxembourg-latest.osm.pbf \
  --output=luxembourg.pmtiles --maxzoom=14 --exclude-layers=poi,housenumber,mountain_peak
python3 skripte/pmtiles_kopf.py luxembourg.pmtiles
```

Tests: `node --test 'test/*.test.mjs' && python3 -I -m unittest discover -s test -p 'test_*.py'`

## Dateien

| Datei | Zweck |
|---|---|
| `gebiete.json` | welche Länder/Gebiete, mit Geofabrik-Pfad |
| `karten.json` | Planetiler-Version, Varianten, Ablage, Grundpaket, Zeitschätzung |
| `skripte/plan.mjs` | Matrix, geprüfte Planetiler-Schalter, Zeitrechnung |
| `skripte/pmtiles_kopf.py` | PMTiles-Kopf prüfen, bevor etwas hochgeht |
| `skripte/stand.mjs` | Meldungen → `stand.json`, Aufräumen |
| `skripte/stand-hochladen.sh` | `stand.json` bedingt schreiben, Grundpaket, alte Fassungen löschen |
| `skripte/grundpaket.mjs` | Schriften + Sprite + Lizenztexte |
| `skripte/r2-werte.sh` | häufige Verwechslungen in den Secrets geradeziehen (gibt nie Werte aus) |
| `lizenzen/` | OFL-Text der Noto-Schriften, Hinweis zum Sprite |

---

## English summary

**freq-karten** builds monthly offline vector map files (PMTiles, OpenMapTiles schema, via Planetiler from Geofabrik extracts) for every EU/EEA country and the UK (without Switzerland and Liechtenstein). Each area comes in two variants, `voll` (full, z0–14) and `leicht` (light: roads, places, water, boundaries, z0–13). It also builds a small font and sprite bundle for offline labels. The files are published at `https://karten.freqconvoi.com/karten/v1/stand.json` (full) and `…/v1/leicht/stand.json` (light), each with size and SHA-256.

**Licenses:** code MIT. Map data © OpenStreetMap contributors, ODbL 1.0: attribute “© OpenStreetMap contributors” and share derived databases alike. Schema © OpenMapTiles (CC BY 4.0). Planetiler is Apache-2.0. Fonts (Noto Sans glyphs) are SIL OFL 1.1. The sprite is MIT (OpenFreeMap styles) with CC0 Maki icons. The license texts ship inside the bundle.

Please be fair with the hosted files. For heavy use, fork this repo and build your own; it only needs four R2 secrets.
