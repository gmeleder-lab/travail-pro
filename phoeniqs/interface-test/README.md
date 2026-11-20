# Banc de test Phoeniqs

Une page web pour tester un cas d'usage sur un modèle Phoeniqs, sans ligne de commande : le testeur écrit son prompt, choisit le modèle, lit la réponse, peut relancer deux fois, puis enregistre la séquence en PDF.

## Ce que fait l'interface

1. **Cas d'usage** : intitulé et nom du testeur (facultatifs), choix du modèle. La consigne de cadrage envoyée au modèle est visible et modifiable.
2. **Séquence de test** : un prompt, puis jusqu'à deux re-prompts, soit trois échanges au maximum. Le modèle reçoit tout l'historique à chaque re-prompt. Le modèle et le cadrage sont figés dès le premier envoi, pour que la séquence reste comparable.
3. **PDF** : le bouton « Télécharger en PDF » ouvre la fenêtre d'impression du navigateur avec un rapport mis en page (cas d'usage, modèle, testeur, date, cadrage, chaque prompt et chaque réponse avec son temps). Il faut y choisir « Enregistrer au format PDF » comme destination. Le nom de fichier proposé contient le modèle, l'intitulé et la date.

À savoir :

- Une erreur (modèle indisponible, coupure réseau) ne consomme pas d'échange : le prompt reste dans le champ.
- La séquence en cours est gardée dans le navigateur : un rechargement de page ne la perd pas. « Nouveau test » l'efface.
- La case « Afficher le texte brut » montre la réponse telle que le modèle l'a écrite, sans mise en forme. Le PDF suit ce choix.

## Installation (une seule fois)

Il faut Python 3.9 ou plus récent (déjà présent sur la plupart des Mac). Aucune autre installation.

1. Dans ce dossier, copiez `.env.example` et nommez la copie `.env`.
2. Ouvrez `.env` avec un éditeur de texte et collez votre clé d'API Phoeniqs après `PHOENIQS_API_KEY=`.

Le fichier `.env` reste sur la machine : il est exclu de Git et la clé n'est jamais envoyée au navigateur.

## Lancement

- **Sur Mac** : double-cliquez sur `lancer.command`. Une fenêtre Terminal s'ouvre et la page s'affiche dans le navigateur. Au premier lancement, macOS peut demander une confirmation (clic droit sur le fichier, puis « Ouvrir »).
- **Autre système, ou depuis un terminal** :

```bash
python3 serveur.py
```

La page est à l'adresse http://localhost:8765. Pour arrêter, fermez la fenêtre Terminal ou faites Ctrl+C.

Pour essayer l'interface sans clé, avec des réponses factices :

```bash
PHOENIQS_DEMO=1 python3 serveur.py
```

## Partager avec d'autres testeurs

Par défaut, la page n'est accessible que depuis la machine qui a lancé le serveur. Pour l'ouvrir aux autres postes du même réseau, ajoutez `HOTE=0.0.0.0` dans `.env`, puis donnez-leur l'adresse `http://<adresse-IP-de-la-machine>:8765`.

Attention : il n'y a pas de mot de passe. Toute personne qui atteint cette adresse peut consommer les crédits de la clé. À réserver à un réseau de confiance.

## Fonctionnement

- `serveur.py` sert la page et relaie les demandes vers l'API Phoeniqs (`https://maas.phoeniqs.com/v1`, compatible OpenAI). Il n'utilise que la bibliothèque standard de Python.
- `static/` contient la page (`index.html`, `style.css`, `app.js`).
- `static/vendor/` contient deux bibliothèques libres, copiées telles quelles : marked 15.0.12 (mise en forme Markdown) et DOMPurify 3.2.6 (nettoyage du HTML produit par les modèles).
- La liste des modèles vient de l'API. Les six modèles évalués en novembre 2026 sont proposés en premier ; si l'API ne donne pas de liste, ils sont proposés seuls.

## Limites

- Les réponses s'affichent d'un bloc, à la fin de la génération (jusqu'à plus d'une minute pour les modèles lents). Un compteur indique le temps écoulé.
- Les modèles ne reçoivent que du texte : pas d'envoi d'image ou de fichier.
- Rien n'est enregistré côté serveur. Le PDF est la seule trace durable d'un test.
