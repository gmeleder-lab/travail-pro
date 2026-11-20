# Mettre le banc de test en ligne

Ce guide sert à héberger l'interface chez un hébergeur suisse, pour que les testeurs y accèdent par une adresse web avec un code personnel.

## Ce qu'il faut

- Un hébergement qui fait tourner un conteneur Docker et fournit une adresse en HTTPS. Chez Infomaniak, c'est l'offre Jelastic Cloud ; un serveur virtuel (VPS) avec Docker convient aussi. Un hébergement web classique (PHP, WordPress) ne suffit pas.
- La clé d'API Phoeniqs (elle commence par `sk-`).
- La liste des testeurs.

## 1. Créer les codes d'accès

Sur votre ordinateur, dans ce dossier :

```bash
python3 generer_codes.py "Marie Dupont" "Paul Martin"
```

Le script affiche un code par personne, les enregistre dans `codes.txt` et affiche la ligne `CODES_ACCES=…` à donner à l'hébergeur. Relancez-le avec de nouveaux noms pour ajouter des testeurs : les codes existants ne changent pas.

`codes.txt` est exclu de Git, comme `.env`. Transmettez chaque code à la personne concernée par un canal privé.

## 2. Régler l'hébergement

Trois variables d'environnement sont à saisir chez l'hébergeur :

| Variable | Valeur |
| --- | --- |
| `PHOENIQS_API_KEY` | la clé d'API Phoeniqs |
| `CODES_ACCES` | la ligne affichée par `generer_codes.py`, sans le préfixe `CODES_ACCES=` |
| `QUOTA_JOUR` | facultatif : nombre de demandes par testeur et par jour (100 par défaut, 0 pour ne pas limiter) |

Le conteneur écoute sur le port 8080. L'hébergeur doit diriger son adresse HTTPS vers ce port.

## 3. Déployer

Le fichier `Dockerfile` de ce dossier décrit le conteneur. Deux façons de faire, selon l'hébergeur :

**L'hébergeur construit l'image depuis GitHub.** Indiquez le dépôt `gmeleder-lab/travail-pro`, la branche `main` et le dossier `phoeniqs/interface-test`.

**Vous disposez d'un serveur avec Docker.** Copiez ce dossier sur le serveur, puis :

```bash
docker build -t banc-test-phoeniqs .
```

```bash
docker run -d --name banc-test --restart unless-stopped -p 8080:8080 \
  -e PHOENIQS_API_KEY="sk-…" \
  -e CODES_ACCES="Marie Dupont:XXXX-XXXX-XXXX;Paul Martin:XXXX-XXXX-XXXX" \
  banc-test-phoeniqs
```

Dans ce second cas, il faut encore placer un serveur HTTPS devant le port 8080 (Caddy ou nginx) : sans HTTPS, les codes et les prompts circuleraient en clair.

## 4. Vérifier

1. Ouvrez `https://votre-adresse/api/sante` : la page doit afficher `{"etat": "ok"}`.
2. Ouvrez `https://votre-adresse/` : l'écran « Code d'accès » doit apparaître.
3. Saisissez un code, envoyez un prompt court et vérifiez que le modèle répond.

## Au quotidien

- **Ajouter ou retirer un testeur** : modifiez `CODES_ACCES` chez l'hébergeur, puis redémarrez le conteneur. Retirer une personne ne dérange pas les autres.
- **Suivre l'usage** : le journal du conteneur indique, pour chaque demande, la date, le testeur, le modèle et le temps de réponse. Les prompts et les réponses n'y figurent pas.
- **Mettre à jour l'interface** : reconstruisez l'image à partir de la dernière version du dépôt.

## Protections en place

- Sans code valide, le serveur ne renvoie ni la liste des modèles ni aucune réponse.
- Après 8 codes erronés en dix minutes depuis la même adresse, les essais sont bloqués dix minutes.
- Chaque testeur est limité à `QUOTA_JOUR` demandes par jour, pour protéger les crédits de la clé. Le compteur repart de zéro si le conteneur redémarre.
- Ouvert au réseau sans aucun code défini, le serveur refuse de démarrer.
- La page ne charge aucune ressource externe : une image ou un script glissé dans la réponse d'un modèle n'est pas exécuté.

## Limites

- Rien n'est enregistré sur le serveur : chaque séquence reste dans le navigateur du testeur, et le PDF est la seule trace durable. Pour regrouper les évaluations, les testeurs doivent vous envoyer leurs PDF.
- Les prompts transitent par l'hébergeur avant d'arriver chez Phoeniqs. Les testeurs ne doivent pas y coller de données personnelles d'élèves tant que les conditions de traitement de Phoeniqs ne sont pas clarifiées.
