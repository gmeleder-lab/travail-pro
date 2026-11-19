#!/bin/bash
# Double-cliquez sur ce fichier (Mac) pour démarrer le banc de test.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 est introuvable. Installez-le depuis https://www.python.org/downloads/ puis relancez."
  read -r -p "Appuyez sur Entrée pour fermer."
  exit 1
fi
python3 serveur.py
