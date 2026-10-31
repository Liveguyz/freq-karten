#!/usr/bin/env python3
"""pmtiles_kopf.py — eine frisch gebaute .pmtiles-Datei vor dem Hochladen prüfen.

    python3 -I skripte/pmtiles_kopf.py <datei.pmtiles>
        → {"minzoom": 0, "maxzoom": 14, "grenzen": [w, s, o, n], "bytes": 123}
          Exit 1 mit einer Zeile auf stderr, wenn die Datei nicht passt.

Geprüft wird, was MapLibre Native braucht: PMTiles v3, Vektor-Kacheln (MVT),
Kompression keine oder gzip (brotli/zstd kann MapLibre Native nicht), kein
Teil zeigt hinter das Dateiende (abgeschnitten), sinnvolle Grenzen und Zoomstufen.
Spezifikation: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
"""
import json
import os
import struct
import sys

PMTILES_KOPF = struct.Struct("<7sB8Q3Q6B2i2iB2i")
assert PMTILES_KOPF.size == 127
KACHEL_MVT = 1
KOMPRESSION_OK = (1, 2)


def pmtiles_kopf(daten, groesse=None):
    """Prüft den Kopf einer pmtiles-Datei und gibt das Wichtigste zurück."""
    if len(daten) < PMTILES_KOPF.size:
        raise ValueError("pmtiles: Kopf zu kurz")
    w = PMTILES_KOPF.unpack_from(daten, 0)
    if w[0] != b"PMTiles":
        raise ValueError("pmtiles: falsche Kennung")
    if w[1] != 3:
        raise ValueError(f"pmtiles: Version {w[1]}, erwartet 3")
    (root_off, root_len, meta_off, meta_len, leaf_off, leaf_len, data_off, data_len) = w[2:10]
    (_clustered, intern, kachel_kompression, kachel_typ, minzoom, maxzoom) = w[13:19]
    min_lon, min_lat, max_lon, max_lat = w[19:23]
    if kachel_typ != KACHEL_MVT:
        raise ValueError(f"pmtiles: Kacheltyp {kachel_typ}, erwartet Vektor (1)")
    if kachel_kompression not in KOMPRESSION_OK or intern not in KOMPRESSION_OK:
        raise ValueError("pmtiles: Kompression, die MapLibre nicht lesen kann")
    if not (0 <= minzoom <= maxzoom <= 22):
        raise ValueError("pmtiles: Zoomstufen unsinnig")
    if groesse is not None:
        for off, laenge in ((root_off, root_len), (meta_off, meta_len), (leaf_off, leaf_len), (data_off, data_len)):
            if off + laenge > groesse:
                raise ValueError("pmtiles: Teil zeigt hinter das Dateiende (abgeschnitten?)")
        if root_len <= 0 or data_len <= 0:
            raise ValueError("pmtiles: leer")
    grenzen = [round(min_lon / 1e7, 5), round(min_lat / 1e7, 5), round(max_lon / 1e7, 5), round(max_lat / 1e7, 5)]
    if not (-180 <= grenzen[0] < grenzen[2] <= 180 and -90 <= grenzen[1] < grenzen[3] <= 90):
        raise ValueError("pmtiles: Grenzen unsinnig")
    return {"minzoom": minzoom, "maxzoom": maxzoom, "grenzen": grenzen}


def pruefen(pfad):
    groesse = os.path.getsize(pfad)
    with open(pfad, "rb") as f:
        kopf = pmtiles_kopf(f.read(PMTILES_KOPF.size), groesse)
    kopf["bytes"] = groesse
    return kopf


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Aufruf: pmtiles_kopf.py <datei.pmtiles>")
        print(json.dumps(pruefen(sys.argv[1])))
    except Exception as e:  # noqa: BLE001 — eine klare Zeile für das Protokoll
        print(f"[pmtiles] Fehler: {e}", file=sys.stderr)
        sys.exit(1)
