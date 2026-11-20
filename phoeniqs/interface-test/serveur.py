#!/usr/bin/env python3
"""Banc de test Phoeniqs : petit serveur local.

Il sert la page web et relaie les demandes vers l'API Phoeniqs, pour que
la clé d'API reste sur cette machine et n'arrive jamais dans le navigateur.
Aucune dépendance : la bibliothèque standard de Python 3.9+ suffit.
"""

import json
import os
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DOSSIER = Path(__file__).resolve().parent
STATIQUE = DOSSIER / "static"

MAX_PROMPTS = 3            # 1 prompt + 2 re-prompts par cas d'usage
MAX_CARACTERES = 200_000   # taille maximale d'une demande
DELAI_API_S = 300

# Modèles déjà évalués en novembre 2026 : proposés en tête de liste, et
# utilisés seuls si la liste de l'API n'est pas disponible.
MODELES_TESTES = [
    "inference-glm5",
    "inference-glm5-flash",
    "inference-deepseek-v32",
    "inference-deepseek-v4-flash",
    "inference-gpt-oss-120b",
    "inference-apertus-v15-70b",
]

# Modèles qui ne répondent pas à un prompt texte (embeddings, classement,
# transcription audio, OCR, génération d'image) : retirés de la liste.
HORS_CONVERSATION = re.compile(r"bge|rerank|emb|whisper|ocr|miner|image|flix", re.I)

CADRAGE_PAR_DEFAUT = (
    "Tu es un assistant pédagogique pour l'enseignement postobligatoire "
    "vaudois. Tu réponds en français de Suisse romande."
)

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def charger_env():
    """Lit le fichier .env du dossier, sans écraser l'environnement existant."""
    fichier = DOSSIER / ".env"
    if not fichier.exists():
        return
    for ligne in fichier.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#") or "=" not in ligne:
            continue
        nom, valeur = ligne.split("=", 1)
        valeur = valeur.strip().strip('"').strip("'")
        os.environ.setdefault(nom.strip(), valeur)


charger_env()

CLE = os.environ.get("PHOENIQS_API_KEY", "").strip()
BASE = os.environ.get("PHOENIQS_BASE_URL", "https://maas.phoeniqs.com/v1").rstrip("/")
HOTE = os.environ.get("HOTE", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
DEMO = os.environ.get("PHOENIQS_DEMO", "") == "1"

_cache_modeles = {"quand": 0.0, "liste": None}


class ErreurApi(Exception):
    pass


def appel_api(chemin, corps=None):
    """Appelle l'API Phoeniqs et renvoie le JSON décodé."""
    donnees = json.dumps(corps).encode("utf-8") if corps is not None else None
    requete = urllib.request.Request(
        BASE + chemin,
        data=donnees,
        method="POST" if donnees else "GET",
        headers={
            "Authorization": "Bearer " + CLE,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(requete, timeout=DELAI_API_S) as reponse:
            return json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        try:
            contenu = json.loads(detail)
            erreur = contenu.get("error", contenu)
            if isinstance(erreur, dict):
                detail = erreur.get("message") or detail
            elif isinstance(erreur, str):
                detail = erreur
        except (ValueError, AttributeError):
            pass
        if e.code in (401, 403):
            raise ErreurApi(
                "Phoeniqs a refusé la clé d'API (erreur %d). Vérifiez "
                "PHOENIQS_API_KEY dans le fichier .env. Détail : %s" % (e.code, detail)
            )
        raise ErreurApi("Phoeniqs a répondu par une erreur %d : %s" % (e.code, detail))
    except urllib.error.URLError as e:
        if isinstance(e.reason, ssl.SSLCertVerificationError):
            raise ErreurApi(
                "Python ne trouve pas les certificats de sécurité de cette "
                "machine. Sur Mac, lancez « Install Certificates.command » "
                "dans le dossier Applications/Python, puis relancez le serveur."
            )
        raise ErreurApi("Impossible de joindre Phoeniqs (%s) : %s" % (BASE, e.reason))
    except TimeoutError:
        raise ErreurApi(
            "Le modèle n'a pas répondu en %d secondes. Réessayez, ou "
            "choisissez un modèle plus rapide." % DELAI_API_S
        )
    except ValueError:
        raise ErreurApi("Phoeniqs a renvoyé une réponse illisible.")


def liste_modeles():
    """Modèles déjà testés d'abord, puis les autres modèles de l'API."""
    if DEMO or not CLE:
        return {"testes": MODELES_TESTES, "autres": [], "source": "liste par défaut"}
    if _cache_modeles["liste"] and time.time() - _cache_modeles["quand"] < 600:
        return _cache_modeles["liste"]
    ids = None
    for _ in range(2):  # un second essai couvre une coupure passagère au démarrage
        try:
            ids = sorted(
                m["id"] for m in appel_api("/models").get("data", [])
                if m.get("id") and not HORS_CONVERSATION.search(m["id"])
            )
            break
        except (ErreurApi, KeyError, TypeError, AttributeError):
            time.sleep(1)
    if ids is None:
        return {"testes": MODELES_TESTES, "autres": [], "source": "liste par défaut"}
    resultat = {
        "testes": [m for m in MODELES_TESTES if m in ids],
        "autres": [m for m in ids if m not in MODELES_TESTES],
        "source": "API Phoeniqs",
    }
    if not resultat["testes"] and not resultat["autres"]:
        resultat = {"testes": MODELES_TESTES, "autres": [], "source": "liste par défaut"}
    _cache_modeles.update(quand=time.time(), liste=resultat)
    return resultat


def reponse_demo(messages):
    """Réponse factice, pour essayer l'interface sans clé d'API."""
    time.sleep(1.2)
    numero = sum(1 for m in messages if m["role"] == "user")
    dernier = messages[-1]["content"]
    return (
        "## Réponse de démonstration (échange %d)\n\n"
        "Le **mode démonstration** est actif : aucun modèle n'a été appelé.\n\n"
        "Votre demande faisait %d caractères. Voici un exemple de mise en forme :\n\n"
        "1. une liste numérotée ;\n2. avec *deux* éléments.\n\n"
        "| Critère | Note |\n| --- | --- |\n| Exactitude | 4 |\n| Français | 5 |\n\n"
        "```\n=B2/1,081\n```\n" % (numero, len(dernier))
    )


def valider(corps):
    """Vérifie la demande du navigateur ; renvoie (modèle, messages)."""
    if not isinstance(corps, dict):
        raise ValueError("Demande invalide.")
    modele = corps.get("model")
    messages = corps.get("messages")
    if not isinstance(modele, str) or not modele.strip():
        raise ValueError("Choisissez un modèle.")
    if not isinstance(messages, list) or not messages:
        raise ValueError("Le prompt est vide.")
    propres = []
    for m in messages:
        if (
            not isinstance(m, dict)
            or m.get("role") not in ("system", "user", "assistant")
            or not isinstance(m.get("content"), str)
        ):
            raise ValueError("Demande invalide.")
        if m["content"].strip():
            propres.append({"role": m["role"], "content": m["content"]})
    if not propres or propres[-1]["role"] != "user":
        raise ValueError("Le prompt est vide.")
    if sum(1 for m in propres if m["role"] == "user") > MAX_PROMPTS:
        raise ValueError(
            "Un cas d'usage est limité à %d prompts (1 prompt et %d re-prompts)."
            % (MAX_PROMPTS, MAX_PROMPTS - 1)
        )
    if sum(len(m["content"]) for m in propres) > MAX_CARACTERES:
        raise ValueError("La demande est trop longue.")
    return modele.strip(), propres


class Gestionnaire(BaseHTTPRequestHandler):
    server_version = "BancTestPhoeniqs/1.0"

    def log_message(self, format, *args):  # journal plus discret
        sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), format % args))

    def envoyer_json(self, code, objet):
        donnees = json.dumps(objet, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(donnees)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(donnees)

    def do_GET(self):
        chemin = self.path.split("?", 1)[0]
        if chemin == "/api/config":
            self.envoyer_json(200, {
                "modeles": liste_modeles(),
                "cadrage": CADRAGE_PAR_DEFAUT,
                "maxPrompts": MAX_PROMPTS,
                "demo": DEMO,
                "cleAbsente": not CLE and not DEMO,
            })
            return
        if chemin == "/":
            chemin = "/index.html"
        fichier = (STATIQUE / chemin.lstrip("/")).resolve()
        if STATIQUE not in fichier.parents or not fichier.is_file():
            self.send_error(404, "Page introuvable")
            return
        donnees = fichier.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(fichier.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(donnees)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(donnees)

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404, "Page introuvable")
            return
        # Refuse les demandes venues d'un autre site ouvert dans le navigateur.
        origine = self.headers.get("Origin")
        if origine and origine.split("//", 1)[-1] != self.headers.get("Host"):
            self.envoyer_json(403, {"erreur": "Demande refusée."})
            return
        try:
            taille = int(self.headers.get("Content-Length", "0"))
            if taille <= 0 or taille > 4 * MAX_CARACTERES:
                raise ValueError("La demande est trop longue.")
            modele, messages = valider(json.loads(self.rfile.read(taille).decode("utf-8")))
        except (ValueError, UnicodeDecodeError) as e:
            message = str(e) if isinstance(e, ValueError) and "JSON" not in type(e).__name__ else "Demande invalide."
            self.envoyer_json(400, {"erreur": message})
            return

        debut = time.monotonic()
        if DEMO:
            texte, usage = reponse_demo(messages), None
        elif not CLE:
            self.envoyer_json(503, {"erreur": "La clé d'API Phoeniqs n'est pas configurée (fichier .env)."})
            return
        else:
            try:
                resultat = appel_api("/chat/completions", {"model": modele, "messages": messages})
                message = resultat["choices"][0]["message"]
                texte = message.get("content") or ""
                usage = resultat.get("usage")
            except ErreurApi as e:
                self.envoyer_json(502, {"erreur": str(e)})
                return
            except (KeyError, IndexError, TypeError, AttributeError):
                self.envoyer_json(502, {"erreur": "Phoeniqs a renvoyé une réponse inattendue."})
                return
            if not texte.strip():
                self.envoyer_json(502, {"erreur": "Le modèle a renvoyé une réponse vide. Réessayez."})
                return
        self.envoyer_json(200, {
            "contenu": texte,
            "secondes": round(time.monotonic() - debut, 1),
            "usage": usage,
        })


def main():
    serveur = ThreadingHTTPServer((HOTE, PORT), Gestionnaire)
    adresse = "http://%s:%d" % ("localhost" if HOTE in ("127.0.0.1", "0.0.0.0") else HOTE, PORT)
    print("Banc de test Phoeniqs : %s" % adresse)
    if DEMO:
        print("Mode démonstration : aucun modèle n'est appelé.")
    elif not CLE:
        print("Attention : PHOENIQS_API_KEY est absente. Créez le fichier .env (voir README).")
    print("Pour arrêter : Ctrl+C, ou fermez cette fenêtre.")
    if os.environ.get("SANS_NAVIGATEUR", "") != "1":
        threading.Timer(0.6, webbrowser.open, args=(adresse,)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")


if __name__ == "__main__":
    main()
