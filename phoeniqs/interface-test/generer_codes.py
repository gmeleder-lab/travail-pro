#!/usr/bin/env python3
"""Crée un code d'accès personnel par testeur et l'ajoute à codes.txt.

Usage :  python3 generer_codes.py "Marie Dupont" "Paul Martin"
"""

import secrets
import sys
from pathlib import Path

FICHIER = Path(__file__).resolve().parent / "codes.txt"
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sans 0/O ni 1/I/L, faciles à confondre


def nouveau_code():
    brut = "".join(secrets.choice(ALPHABET) for _ in range(12))
    return "-".join(brut[i:i + 4] for i in range(0, 12, 4))


def lire():
    paires = []
    if FICHIER.exists():
        for ligne in FICHIER.read_text(encoding="utf-8").splitlines():
            if ligne.strip() and not ligne.startswith("#") and ";" in ligne:
                nom, code = ligne.rsplit(";", 1)
                paires.append((nom.strip(), code.strip()))
    return paires


def main():
    noms = [n.strip() for n in sys.argv[1:] if n.strip()]
    paires = lire()
    if not noms and not paires:
        sys.exit(__doc__)
    connus = {nom for nom, _ in paires}
    for nom in noms:
        if ";" in nom or ":" in nom:
            sys.exit("Le nom « %s » ne doit contenir ni point-virgule ni deux-points." % nom)
        if nom in connus:
            print("Déjà présent, code inchangé : %s" % nom)
            continue
        paires.append((nom, nouveau_code()))
        connus.add(nom)
    entete = "# Codes d'accès du banc de test Phoeniqs. Une ligne par testeur : Nom ; code\n"
    FICHIER.write_text(entete + "".join("%s ; %s\n" % p for p in paires), encoding="utf-8")
    FICHIER.chmod(0o600)

    print("\nCodes à transmettre (un par personne) :\n")
    for nom, code in paires:
        print("  %-28s %s" % (nom, code))
    print("\nEnregistrés dans %s." % FICHIER.name)
    print("Pour retirer un accès, supprimez la ligne de la personne, puis relancez le serveur.")
    print("\nSi votre hébergeur demande une variable d'environnement, utilisez :\n")
    print("  CODES_ACCES=" + ";".join("%s:%s" % p for p in paires))


if __name__ == "__main__":
    main()
