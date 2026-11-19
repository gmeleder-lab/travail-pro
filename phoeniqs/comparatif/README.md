# Comparatif des modèles d'IA souveraine Phoeniqs

Copie du classeur Google Sheets « comparatif_modeles_IA_souveraine_Phoeniqs » (créé le 03.11.2026), un onglet par section. Les mêmes données sont disponibles en CSV dans ce dossier.

## Modèles de langage retenus (Phoeniqs)

Source : documentation.phoeniqs.com/maas/active-models (consultée le 03.11.2026). Coûts en crédits Phoeniqs.

| Modèle | Rôle proposé | Origine | Licence | Images | Contexte (tokens) | Coût entrée (crédits/M) | Coût sortie (crédits/M) | Forces | Limites |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Apertus v1.5 70B | Vitrine souveraine, assistant multilingue | Suisse (EPFL/ETHZ) | Apache 2.0 | Oui | 262 144 | 0,620 | 2,220 | Données d'entraînement publiées, FR/DE/IT, cohérent avec le Numérique responsable | Moins performant que les meilleurs modèles, le plus cher des trois principaux |
| GPT-OSS 120B | Moteur principal de l'assistant | USA (OpenAI, poids ouverts) | Apache 2.0 | Non | 131 072 | 0,115 | 0,462 | Meilleur rapport performance/coût, raisonnement, appel d'outils | Texte uniquement |
| Gemma 4 31B | Multimodal, usage à large échelle | USA (Google) | Apache 2.0 | Oui | 131 072 | 0,118 | 0,325 | Bon en français, très bon marché | Raisonnement moins poussé que GPT-OSS |
| DeepSeek V4 Flash | Maths, sciences, documents longs | Chine | MIT | Non | 1 000 000 | 0,146 | 0,393 | Contexte très long, peu coûteux | Biais possibles sur les sujets historiques et politiques |
| Qwen3-VL 235B | Analyse d'images exigeante (copies manuscrites, schémas) | Chine | Apache 2.0 | Oui | 128 000 | 0,700 | 2,000 | Le plus puissant pour l'image | Coût, biais possibles comme DeepSeek |
| GLM 5.2 | Cours d'informatique, code | Chine | MIT | Non | 131 072 | 1,077 | 3,386 | Excellent en code agentique | Le plus cher, usage de niche |

## Briques techniques (RAG, documents, audio)

Source : documentation.phoeniqs.com/maas/active-models (consultée le 03.11.2026). Coûts en crédits Phoeniqs.

| Modèle | Rôle proposé | Origine | Licence | Coût entrée | Coût sortie | Unité | Usage pédagogique |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BGE-M3 | Embeddings | Chine (BAAI) | MIT | 0,431 |  | crédits/M tokens | Indexer les plans d'études, supports de cours, règlements |
| BGE Reranker v2 | Classement des résultats | Chine (BAAI) | Apache 2.0 | 0,008 |  | crédits/M tokens | Améliorer la pertinence des réponses du RAG |
| DeepSeek OCR | OCR | Chine | MIT | 0,385 | 1,539 | crédits/M tokens | Numériser des documents scannés |
| MinerU 2.5 | Analyse de mise en page | Chine (OpenDataLab) | AGPL 3.0 | 0,380 | 0,230 | crédits/M tokens | PDF complexes (tableaux, formules) |
| Whisper Large v3 | Transcription | USA (OpenAI, poids ouverts) | Apache 2.0 | 0,006 |  | crédits/minute | Sous-titrage, accessibilité, oral en langues étrangères |

## Points d'attention

| Sujet | Point d'attention |
| --- | --- |
| Provenance chinoise | Données hébergées en Suisse, mais biais possibles sur des sujets historiques ou politiques : réserver DeepSeek, Qwen et GLM aux tâches techniques. Les briques RAG/OCR ne génèrent pas de contenu destiné aux élèves, risque négligeable. |
| Public mineur | Aucun modèle de modération (guardrail) n'est proposé : prévoir une couche de filtrage pour l'usage direct par les élèves. |
| Licences | AGPL 3.0 de MinerU à faire valider (pas de problème en simple appel d'API). |
| Stabilité | Phoeniqs peut modifier ou retirer un modèle sans préavis : à prendre en compte pour des scénarios pédagogiques sur une année scolaire. |
| Coûts | Prix exprimés en crédits Phoeniqs, susceptibles de changer. Conversion en CHF à obtenir auprès du fournisseur. |
