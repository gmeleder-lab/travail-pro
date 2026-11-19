# Phoeniqs : évaluation de modèles d'IA ouverts hébergés en Suisse

Travail mené en novembre 2026 pour savoir si les modèles ouverts fournis par Phoeniqs (Phoenix Technologies / Kvant) peuvent répondre aux besoins des enseignant·es du postobligatoire vaudois.

## Contenu

| Fichier | Contenu | Date | Original |
| --- | --- | --- | --- |
| [recapitulatif-tests-modeles.md](recapitulatif-tests-modeles.md) | Récapitulatif du test : 14 cas d'usage pédagogiques, 3 modèles par cas, 42 réponses notées de 1 à 5, détail de chaque test, limites et recommandations | 05.11.2026 | [Doc Claude](https://claude.ai/artifact/9UJXAUNUmBMgpDSgcqLVGY) |
| [recapitulatif_tests_modeles_phoeniqs.docx](recapitulatif_tests_modeles_phoeniqs.docx) | Le même récapitulatif au format Word, avec le graphique | 05.11.2026 | export du doc Claude |
| [resultats.csv](resultats.csv) | Les 42 réponses brutes des modèles : identifiant du test, modèle, temps de génération en secondes, texte complet de la réponse (séparateur `;`, UTF-8) | novembre 2026 | sortie du script de test |
| [graphique-qualite-vs-temps.png](graphique-qualite-vs-temps.png) | Graphique note moyenne / temps de réponse moyen par modèle | 05.11.2026 | extrait du fichier Word |
| [comparaison-modeles.csv](comparaison-modeles.csv) | Note moyenne, temps de réponse moyen et nombre de tests par modèle (données du graphique du récapitulatif) | 05.11.2026 | idem |
| [comparatif/](comparatif/README.md) | Comparatif des modèles retenus : rôle proposé, origine, licence, contexte, coûts, forces et limites ; briques techniques (RAG, OCR, audio) ; points d'attention | 03.11.2026 | [Google Sheets](https://docs.google.com/spreadsheets/d/1RqujDzxhwGJicVJ3l6PW0aNkEKWlEozExCiJGwEz8CE/edit) |

## En bref

- GLM 5 obtient la meilleure note moyenne (4,5/5 sur 14 tests), mais c'est le plus lent (38 s par réponse en moyenne).
- gpt-oss-120b est le plus rapide (6 s) et il est solide en raisonnement.
- Apertus 70B décroche (2,8/5) dès qu'une tâche exige de l'exactitude historique ou un format strict.
- Tous les modèles ont produit au moins une erreur factuelle ou une source inventée : aucune sortie n'est utilisable sans relecture.
- Les notes viennent d'une première lecture par Claude et doivent encore être validées par des enseignant·es.

## Ce qui manque dans ce dépôt

Ces éléments sont cités dans le récapitulatif mais n'ont pas encore été retrouvés :

- le script qui a envoyé les 42 demandes à l'API Phoeniqs ;
- le classeur de test, avec la grille de notation et la liste des 31 cas d'usage.

## Prochaines étapes (reprises du récapitulatif)

- [ ] Faire noter les 42 réponses par 2 ou 3 enseignant·es (gymnase et formation professionnelle) avec la grille du classeur de test
- [ ] Importer les QCM GIFT dans un Moodle de test pour vérifier la syntaxe
- [ ] Tester le coach socratique sur une conversation de plusieurs échanges, avec des élèves qui insistent
- [ ] Demander à Phoeniqs le sens des variantes « -GRC » et les conditions de traitement des données
- [ ] Tester les cas avec images (guides pas à pas, documents) sur qwen3-vl-235b
