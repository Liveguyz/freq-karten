# r2-werte.sh — die R2-Secrets vor dem Gebrauch geradeziehen (28.10.2026).
#
# Wird mit `source` geladen (Workflow .github/workflows/karten.yml). Gibt NIE einen Wert
# aus, nur was es geändert hat.
#
#   R2_ACCOUNT_ID  Wer die ganze Endpoint-Adresse eingefügt hat
#                  („https://<id>.r2.cloudflarestorage.com“), bekommt die
#                  32 Zeichen der Kennung daraus.
#   R2_BUCKET      Kein gültiger Bucket-Name (z. B. eine Adresse) → der Name
#                  des FREQ-Buckets, „freq-karten“. Der Name ist
#                  kein Geheimnis.
#
# Danach: R2_WERTE_OK=ja, wenn die Kennung die Form einer Cloudflare-Konto-
# Kennung hat (32 Zeichen 0-9 a-f), sonst nein mit einem ::error::.

R2_WERTE_OK=nein
if [ -n "${R2_ACCOUNT_ID:-}" ]; then
  _r2_klein="$(printf '%s' "$R2_ACCOUNT_ID" | tr 'A-F' 'a-f')"
  if [[ ! "$_r2_klein" =~ ^[0-9a-f]{32}$ ]] && [[ "$_r2_klein" =~ ([0-9a-f]{32}) ]]; then
    R2_ACCOUNT_ID="${BASH_REMATCH[1]}"
    echo "::warning::R2_ACCOUNT_ID war keine reine Konto-Kennung (z. B. die ganze Endpoint-Adresse) — die 32 Zeichen daraus werden benutzt. Sauberer: das Secret neu setzen."
  else
    R2_ACCOUNT_ID="$_r2_klein"
  fi
  if [[ "$R2_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]]; then
    R2_WERTE_OK=ja
  else
    echo "::error::R2_ACCOUNT_ID hat nicht die Form einer Cloudflare-Konto-Kennung (32 Zeichen 0-9 a-f). Neu setzen: gh secret set R2_ACCOUNT_ID --repo Liveguyz/freq-karten (README „Secrets“)."
  fi
  unset _r2_klein
fi
if [ -n "${R2_BUCKET:-}" ] && [[ ! "$R2_BUCKET" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]]; then
  R2_BUCKET="freq-karten"
  echo "::warning::R2_BUCKET ist kein gültiger Bucket-Name (z. B. eine Adresse) — „freq-karten“ wird benutzt. Sauberer: gh secret set R2_BUCKET mit dem Wert freq-karten."
fi
export R2_ACCOUNT_ID R2_BUCKET R2_WERTE_OK
