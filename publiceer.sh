#!/usr/bin/env bash
# Zet Tafelberg als privérepository op GitHub, met de signeersleutel als secret, en start de eerste build.
# Nodig: git en de GitHub CLI (gh). Uitvoeren vanuit deze map: ./publiceer.sh
set -euo pipefail
cd "$(dirname "$0")"

gh auth status >/dev/null 2>&1 || gh auth login

gh repo create tafelberg --private --source . --remote origin \
  --description "Tafelberg: maaltafels oefenen voor het tweede leerjaar"

PW="$(cat _signeersleutel/wachtwoord.txt)"
base64 < _signeersleutel/tafelberg.jks | tr -d '\n' | gh secret set TAFELBERG_KEYSTORE_B64
printf %s "$PW"        | gh secret set TAFELBERG_KEYSTORE_PASSWORD
printf %s "tafelberg"  | gh secret set TAFELBERG_KEY_ALIAS
printf %s "$PW"        | gh secret set TAFELBERG_KEY_PASSWORD

git push -u origin main
echo
echo "Gepusht. De APK wordt nu gebouwd; volg het met: gh run watch"
