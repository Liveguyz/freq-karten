"""Tests für skripte/pmtiles_kopf.py — laufen mit: python3 -I -m unittest discover -s test -p 'test_*.py'"""
import os
import struct
import subprocess
import sys
import tempfile
import unittest

SKRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skripte", "pmtiles_kopf.py")


def pmtiles(grenzen=(5.73, 49.44, 6.53, 50.18), maxzoom=14, typ=1, kompression=2, version=3, schwanz=4000):
    """Eine winzige, formal gültige pmtiles-Datei: Kopf + Platzhalter für Verzeichnis und Kacheln."""
    root_off, root_len = 127, 100
    meta_off, meta_len = 227, 50
    data_off, data_len = 277, schwanz
    w, s, o, n = (int(round(x * 1e7)) for x in grenzen)
    kopf = struct.pack(
        "<7sB8Q3Q6B2i2iB2i",
        b"PMTiles", version,
        root_off, root_len, meta_off, meta_len, 0, 0, data_off, data_len,
        10, 10, 10,
        1, 2, kompression, typ, 0, maxzoom,
        w, s, o, n,
        7, (w + o) // 2, (s + n) // 2,
    )
    return kopf + b"\0" * (root_len + meta_len + data_len)


def pruefe(daten):
    with tempfile.NamedTemporaryFile(suffix=".pmtiles", delete=False) as f:
        f.write(daten)
    try:
        return subprocess.run([sys.executable, "-I", SKRIPT, f.name], capture_output=True, text=True)
    finally:
        os.unlink(f.name)


class PmtilesKopf(unittest.TestCase):
    def test_gueltige_datei(self):
        r = pruefe(pmtiles())
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('"maxzoom": 14', r.stdout)
        self.assertIn("5.73", r.stdout)

    def test_abgeschnitten(self):
        self.assertNotEqual(pruefe(pmtiles()[:-10]).returncode, 0)

    def test_falsche_kennung_version_typ_kompression(self):
        self.assertNotEqual(pruefe(b"X" + pmtiles()[1:]).returncode, 0)
        self.assertNotEqual(pruefe(pmtiles(version=2)).returncode, 0)
        self.assertNotEqual(pruefe(pmtiles(typ=2)).returncode, 0)
        self.assertNotEqual(pruefe(pmtiles(kompression=3)).returncode, 0)

    def test_grenzen_unsinnig(self):
        self.assertNotEqual(pruefe(pmtiles(grenzen=(10, 50, 5, 49))).returncode, 0)


if __name__ == "__main__":
    unittest.main()
