#!/usr/bin/env bash
# stand-hochladen.sh — die Meldungen der Bau-Jobs in stand.json führen,
# das Grundpaket hochladen (wenn fällig) und alte Fassungen wegräumen.
#
#   skripte/stand-hochladen.sh <meldungen-ordner> <grundpaket: ja|nein|faellig>
#
# Braucht: R2_ACCOUNT_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_BUCKET
# (aus den Secrets), aws-cli v2, node, jq.
#
# ZWEI SCHREIBER, EINE DATEI: In denselben Bucket kann auch ein anderer Bau
# (z. B. der Rest der Welt aus dem FREQ-Haupt-Repo) seine stand.json-Einträge
# schreiben. Darum wird stand.json nur BEDINGT ersetzt: mit dem ETag, der
# beim Lesen da war (If-Match), bzw. „nur wenn es sie noch nicht gibt“
# (If-None-Match: *). Hat inzwischen jemand anderes geschrieben, antwortet
# R2 mit 412 — dann neu lesen, neu zusammenführen, bis zu fünf Mal. So geht
# nie ein Eintrag des anderen verloren.
set -euo pipefail

MELDUNGEN="$1"
GRUND="${2:-faellig}"
HIER="$(cd "$(dirname "$0")" && pwd)"
WURZEL="$(cd "$HIER/.." && pwd)"
ARBEIT="$(mktemp -d)"
trap 'rm -rf "$ARBEIT"' EXIT

source "$HIER/r2-werte.sh"
[ "$R2_WERTE_OK" = "ja" ] || { echo "::error::R2-Secrets unbrauchbar (siehe oben)"; exit 1; }
export AWS_ENDPOINT_URL="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
mkdir -p "$MELDUNGEN"

praefix_von() { jq -r --arg v "$1" '.ablage[$v]' "$WURZEL/karten.json"; }

# stand.json lesen. Schreibt den ETag nach $ARBEIT/etag ("" = gibt es nicht)
# und die Datei nach $ARBEIT/alt.json. „Gibt es nicht“ ist etwas anderes als
# „nicht lesbar“: nach einem Netzfehler mit leerer Liste weiterzumachen,
# löschte alle anderen Länder aus der stand.json.
lesen() {
  local key="$1"
  rm -f "$ARBEIT/alt.json"
  if aws s3api head-object --bucket "$R2_BUCKET" --key "$key" > "$ARBEIT/kopf.json" 2> "$ARBEIT/kopf.err"; then
    jq -r '.ETag' "$ARBEIT/kopf.json" > "$ARBEIT/etag"
    aws s3api get-object --bucket "$R2_BUCKET" --key "$key" --if-match "$(cat "$ARBEIT/etag")" "$ARBEIT/alt.json" > /dev/null
  elif grep -q -E '404|Not Found|NoSuchKey' "$ARBEIT/kopf.err"; then
    : > "$ARBEIT/etag"
  else
    cat "$ARBEIT/kopf.err"
    echo "::error::$key nicht lesbar — nichts geändert"
    return 1
  fi
}

# --- Grundpaket (einmal, vor den Versuchen) -----------------------------------
GRUND_DATEI=""
if [ "$GRUND" != "nein" ]; then
  lesen "$(praefix_von voll)stand.json"
  faellig="ja"
  if [ -s "$ARBEIT/etag" ]; then faellig="$(node "$HIER/stand.mjs" grund-faellig --stand "$ARBEIT/alt.json")"; fi
  if [ "$GRUND" = "ja" ] || [ "$faellig" = "ja" ]; then
    rm -rf "$ARBEIT/grund"
    node "$HIER/grundpaket.mjs" --aus "$ARBEIT/grund"
    (cd "$ARBEIT/grund" && zip -q -r -X "$ARBEIT/grund.zip" fonts sprites)
    GRUND_DATEI="grund/grund-$(date -u +%Y%m%dT%H%M%SZ).zip"
    GRUND_BYTES="$(stat -c %s "$ARBEIT/grund.zip")"
    GRUND_SHA="$(sha256sum "$ARBEIT/grund.zip" | cut -d' ' -f1)"
    # Erst die Datei, dann die stand.json, die sie nennt.
    aws s3 cp --only-show-errors "$ARBEIT/grund.zip" "s3://$R2_BUCKET/$(praefix_von voll)$GRUND_DATEI" \
      --content-type application/zip --cache-control 'public, max-age=31536000, immutable'
    echo "Grundpaket: $GRUND_DATEI ($(( GRUND_BYTES / 1024 )) KB)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  fi
fi

# --- stand.json je Variante ----------------------------------------------------
for variante in voll leicht; do
  praefix="$(praefix_von "$variante")"
  key="${praefix}stand.json"
  geschrieben=0
  for versuch in 1 2 3 4 5; do
    lesen "$key"
    alt="-"; [ -s "$ARBEIT/etag" ] && alt="$ARBEIT/alt.json"
    anzahl="$(node "$HIER/stand.mjs" zusammenfuehren --alt "$alt" --meldungen "$MELDUNGEN" --variante "$variante" --aus "$ARBEIT/neu.json")"
    if [ "$variante" = "voll" ] && [ -n "$GRUND_DATEI" ]; then
      node "$HIER/stand.mjs" grund --stand "$ARBEIT/neu.json" --datei "$GRUND_DATEI" \
        --bytes "$GRUND_BYTES" --sha256 "$GRUND_SHA" --aus "$ARBEIT/neu.json"
    fi
    if [ -s "$ARBEIT/etag" ]; then bedingung=(--if-match "$(cat "$ARBEIT/etag")"); else bedingung=(--if-none-match '*'); fi
    if aws s3api put-object --bucket "$R2_BUCKET" --key "$key" --body "$ARBEIT/neu.json" \
         --content-type application/json --cache-control 'no-cache' "${bedingung[@]}" > /dev/null 2> "$ARBEIT/put.err"; then
      geschrieben=1; break
    fi
    if grep -q -E 'PreconditionFailed|412' "$ARBEIT/put.err"; then
      echo "::notice::$key wurde inzwischen von jemand anderem geschrieben — neu lesen (Versuch $versuch)"
      sleep $(( RANDOM % 10 + 5 ))
      continue
    fi
    cat "$ARBEIT/put.err"; echo "::error::$key nicht geschrieben"; exit 1
  done
  [ "$geschrieben" = 1 ] || { echo "::error::$key: fünf Mal kam ein anderer Schreiber dazwischen — nichts geändert, beim nächsten Lauf wieder"; exit 1; }
  echo "R2 $variante: $anzahl Gebiete in stand.json" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

  # Alte Fassungen weg — nur Gebiete aus gebiete.json, nur was stand.json
  # nicht mehr nennt und älter als 48 Stunden ist (ein Handy kann gerade fortsetzen).
  aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$praefix" --output json > "$ARBEIT/objekte.json"
  [ -s "$ARBEIT/objekte.json" ] || echo '{}' > "$ARBEIT/objekte.json"
  weg="$(node "$HIER/stand.mjs" aufraeumen --objekte "$ARBEIT/objekte.json" --stand "$ARBEIT/neu.json" \
    --praefix "$praefix" --variante "$variante" --gebiete "$WURZEL/gebiete.json" --aus "$ARBEIT/loeschen.txt")"
  while read -r k; do
    [ -n "$k" ] && aws s3 rm --only-show-errors "s3://$R2_BUCKET/$k"
  done < "$ARBEIT/loeschen.txt"
  echo "R2 $variante: $weg alte Fassungen gelöscht" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
done
