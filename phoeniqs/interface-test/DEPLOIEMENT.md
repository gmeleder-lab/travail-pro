# Mettre le banc de test en ligne chez Infomaniak

Ce guide met l'interface en ligne sur l'offre « Hébergement Node.js » d'Infomaniak, pour que les testeurs y accèdent par une adresse web avec un code personnel. Il n'y a pas de serveur à administrer : le domaine, le HTTPS, le démarrage et les journaux se gèrent dans le Manager Infomaniak.

Les étapes dans le Manager viennent de la documentation d'Infomaniak, consultée le 20.11.2026 ([créer un site Node.js](https://faq.infomaniak.com/2537), [modifier sa configuration](https://faq.infomaniak.com/2535)). Elles n'ont pas été déroulées sur un vrai compte : un libellé peut différer légèrement de ce que vous verrez.

## Ce qu'il faut

- Un compte Infomaniak avec un hébergement Web qui accepte les sites Node.js. L'offre « Hébergement Node.js » est annoncée avec 30 jours gratuits, puis dès CHF 10.91 par mois hors TVA ; une carte de crédit est demandée pour l'essai.
- Une adresse pour le site : un domaine ou un sous-domaine que vous possédez déjà (par exemple `test-ia.votredomaine.ch`), ou un domaine à commander pendant la création.
- La clé d'API Phoeniqs (elle commence par `sk-`).
- La liste des testeurs.

## Étape 1 : créer les codes d'accès

Sur votre ordinateur, dans ce dossier :

```bash
python3 generer_codes.py "Marie Dupont" "Paul Martin"
```

Le script affiche un code par personne et, à la fin, une ligne `CODES_ACCES=…`. Gardez cette ligne pour l'étape 4.

Relancez le script avec de nouveaux noms pour ajouter des testeurs : les codes existants ne changent pas. Le fichier `codes.txt` qu'il crée est exclu de Git.

## Étape 2 : autoriser Infomaniak à lire le dépôt GitHub

Le dépôt est privé : Infomaniak a besoin d'un jeton en lecture seule.

1. Sur GitHub, ouvrez **Settings** (menu de votre photo), puis **Developer settings**, **Personal access tokens**, **Fine-grained tokens**.
2. Cliquez sur **Generate new token**.
3. Donnez-lui un nom (par exemple `infomaniak-lecture`) et une durée de validité.
4. Sous **Repository access**, choisissez **Only select repositories**, puis `gmeleder-lab/travail-pro`.
5. Sous **Permissions**, **Repository permissions**, réglez **Contents** sur **Read-only**. Ne touchez à rien d'autre.
6. Cliquez sur **Generate token** et copiez le jeton (il commence par `github_pat_`). Il ne sera plus affiché ensuite.

L'adresse du dépôt à donner à Infomaniak est alors :

```
https://gmeleder-lab:VOTRE_JETON@github.com/gmeleder-lab/travail-pro.git
```

## Étape 3 : créer le site Node.js

1. Dans le Manager Infomaniak, ouvrez la gestion de vos hébergements et cliquez sur le nom de l'hébergement.
2. Cliquez sur le bouton bleu **Ajouter**.
3. Choisissez **un projet avec technologies avancées**, puis **Suivant**.
4. Choisissez **Node.js**. Gardez la version proposée si elle est égale ou supérieure à 18, puis **Suivant**.
5. Choisissez le type de domaine et saisissez l'adresse du site, puis **Suivant**.
6. Choisissez la **méthode personnalisée**, puis l'import par **Git**, et collez l'adresse du dépôt de l'étape 2.

## Étape 4 : régler le lancement

1. Dans le Manager, cliquez sur le nom du site, puis sur **Gérer les paramètres avancés**, puis sur l'onglet **Node.js**.
2. **Dossier d'exécution** :

```
./phoeniqs/interface-test
```

3. **Commande de lancement**, sur une seule ligne, avec votre clé et la ligne de codes de l'étape 1 :

```
PHOENIQS_API_KEY="sk-…" CODES_ACCES="Marie Dupont:XXXX-XXXX-XXXX;Paul Martin:XXXX-XXXX-XXXX" node serveur.js
```

4. **Port d'écoute** : gardez celui que le Manager propose. Le serveur lit le port transmis par Infomaniak, il n'y a rien à changer dans le code.
5. **Commande de construction** : cochez la case et saisissez `git pull`. Elle servira aux mises à jour ; l'application n'a aucune dépendance à installer.
6. Cliquez sur **Enregistrer**.

Pour limiter le nombre de demandes par testeur et par jour (100 par défaut), ajoutez `QUOTA_JOUR="50"` au début de la commande de lancement.

## Étape 5 : activer le HTTPS et démarrer

1. Sur le tableau de bord du site, activez le **certificat SSL**. Sans HTTPS, les codes et les prompts circuleraient en clair.
2. Cliquez sur **Démarrer**.
3. Ouvrez la console d'exécution du tableau de bord. Elle doit afficher :

```
Banc de test Phoeniqs à l'écoute sur le port …
Accès par code personnel : 2 testeur(s), 100 demandes par jour chacun.
```

## Étape 6 : vérifier

1. Ouvrez `https://votre-adresse/api/sante` : la page doit afficher `{"etat":"ok"}`.
2. Ouvrez `https://votre-adresse/` : l'écran « Code d'accès » doit apparaître.
3. Saisissez un code, choisissez `gpt-oss-120b` (le plus rapide) et envoyez un prompt court.
4. Refaites l'essai avec `glm5`, le plus lent (jusqu'à plus d'une minute par réponse). Si la réponse n'arrive pas alors que `gpt-oss-120b` répond, l'hébergeur coupe les demandes longues : signalez-le au support Infomaniak, ou réservez les tests aux modèles rapides.

## Si quelque chose ne marche pas

| Ce que vous voyez | Cause probable | Quoi faire |
| --- | --- | --- |
| La console affiche « aucun code d'accès n'est défini » | `CODES_ACCES` est absent ou mal écrit dans la commande de lancement | Vérifiez les guillemets et le format `Nom:code;Nom:code` |
| La console affiche « Cannot find module … serveur.js » | Le dossier d'exécution ne pointe pas au bon endroit | Remettez `./phoeniqs/interface-test` |
| La page affiche « La clé d'API Phoeniqs n'est pas configurée » | `PHOENIQS_API_KEY` est absente de la commande de lancement | Ajoutez-la, enregistrez, redémarrez |
| Un envoi affiche « Phoeniqs a refusé la clé d'API » | La clé est fausse ou ce n'est pas une clé `sk-` | Remplacez-la dans la commande de lancement |
| L'import Git échoue | Le jeton GitHub est expiré ou n'a pas le droit **Contents : Read-only** | Créez un nouveau jeton (étape 2) |
| Une erreur indique que le port est déjà utilisé | Un ancien processus tourne encore | Changez la version de Node.js, enregistrez, remettez la bonne version, redémarrez |

## Au quotidien

- **Ajouter ou retirer un testeur** : modifiez `CODES_ACCES` dans la commande de lancement, enregistrez, puis redémarrez. Retirer une personne ne dérange pas les autres.
- **Mettre à jour l'interface** : dans les paramètres avancés, lancez la construction (elle exécute `git pull`), puis redémarrez.
- **Suivre l'usage** : la console d'exécution indique, pour chaque demande, la date, le testeur, le modèle et le temps de réponse. Les prompts et les réponses n'y figurent pas.
- **Arrêter les frais de Phoeniqs** : le bouton **Stop** du tableau de bord coupe l'accès de tout le monde immédiatement.

## Protections en place

- Sans code valide, le serveur ne renvoie ni la liste des modèles ni aucune réponse.
- Après 8 codes erronés en dix minutes depuis la même adresse, les essais sont bloqués dix minutes.
- Chaque testeur est limité à `QUOTA_JOUR` demandes par jour, pour protéger les crédits de la clé. Le compteur repart de zéro si le site redémarre.
- Sans aucun code défini, le serveur refuse de démarrer.
- La page ne charge aucune ressource externe : une image ou un script glissé dans la réponse d'un modèle n'est pas exécuté.

## Limites

- La clé Phoeniqs et les codes sont visibles dans la commande de lancement pour toute personne qui a accès à votre Manager Infomaniak.
- Rien n'est enregistré sur le serveur : chaque séquence reste dans le navigateur du testeur, et le PDF est la seule trace durable. Pour regrouper les évaluations, les testeurs doivent vous envoyer leurs PDF.
- Les prompts transitent par Infomaniak avant d'arriver chez Phoeniqs. Les testeurs ne doivent pas y coller de données personnelles d'élèves tant que les conditions de traitement de Phoeniqs ne sont pas clarifiées.

## Autre hébergeur

Le dossier contient aussi un `Dockerfile`, pour un hébergeur qui fait tourner des conteneurs. Il utilise la version Python du serveur (`serveur.py`), au comportement identique. Les variables à fournir sont les mêmes : `PHOENIQS_API_KEY`, `CODES_ACCES` et, au besoin, `QUOTA_JOUR`. Le conteneur écoute sur le port 8080 et doit être placé derrière une adresse HTTPS.
