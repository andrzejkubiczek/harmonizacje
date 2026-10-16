#!/bin/sh
# Wysyła zmiany (nowe/zmienione pieśni i kod) do repozytorium; hosting publikuje je automatycznie.
set -e
cd "$(dirname "$0")"
git add -A
if git diff --cached --quiet; then
  echo "Brak zmian do wysłania."
  exit 0
fi
git commit -m "${1:-Aktualizacja pieśni}"
git push
echo "Gotowe. Po chwili iPad pobierze zmiany przy najbliższym połączeniu z internetem."
