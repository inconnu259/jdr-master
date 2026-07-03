# Seed Ryuutama

Ce dossier attend, dans un sous-dossier `data/` (gitignoré — contenu extrait du *Guide
du Voyageur*, sous droits d'auteur, NFR4), les 4 fichiers JSON suivants. Sans ces
fichiers, le démarrage de l'API échoue au bootstrap avec un message d'erreur pointant
vers ce README.

```
apps/api/game-systems/ryuutama/data/
  classes.json
  types.json
  attribute-patterns.json
  weapon-categories.json
```

## classes.json

Tableau de 7 objets (une entrée par classe : artisan, chasseur, fermier, guerisseur,
marchand, menestrel, noble) :

```json
[
  {
    "key": "artisan",
    "label": "Artisan",
    "recommendedForBeginners": false,
    "requiresSpecialty": true,
    "specialtyLabel": "Type d'objet de spécialité",
    "talents": [
      { "name": "Création", "effect": "Fabrique un objet", "attributes": ["VIG", "AGI"], "difficulty": "variable" },
      { "name": "Réparation", "effect": "Répare un objet", "attributes": ["VIG", "AGI"], "difficulty": "variable" },
      { "name": "Transformation", "effect": "Transforme une dépouille", "attributes": ["AGI", "INT"], "difficulty": "2×niveau" }
    ]
  }
]
```

Chaque classe doit avoir exactement 3 talents. Seule la classe `artisan` a
`requiresSpecialty: true`.

## types.json

Tableau de 3 objets (attaque, technique, magie) :

```json
[
  {
    "key": "attaque",
    "label": "Attaque",
    "advantages": [
      { "name": "Endurance", "effect": "+4 PV" },
      { "name": "Puissance", "effect": "+1 dégâts" },
      { "name": "Entraînement", "effect": "+1 arme favorite supplémentaire" }
    ]
  }
]
```

## attribute-patterns.json

Tableau (un seul pattern documenté ce palier : Polyvalent) :

```json
[
  { "key": "polyvalent", "label": "Polyvalent", "values": [8, 4, 6, 6] }
]
```

## weapon-categories.json

Tableau de 5 objets (arc, epee-courte, epee-longue, hache, lance) :

```json
[
  { "key": "arc",         "label": "Arc",          "touchFormula": "AGI+INT-2", "damageFormula": "AGI",   "price": 750, "encumbrance": 3, "hands": 2 },
  { "key": "epee-courte", "label": "Épée courte",  "touchFormula": "AGI+INT+1", "damageFormula": "INT-1", "price": 400, "encumbrance": 1, "hands": 1 },
  { "key": "epee-longue", "label": "Épée longue",  "touchFormula": "VIG+AGI",   "damageFormula": "VIG",   "price": 700, "encumbrance": 3, "hands": 1 },
  { "key": "hache",       "label": "Hache",         "touchFormula": "VIG+VIG-1", "damageFormula": "VIG",   "price": 500, "encumbrance": 3, "hands": 2 },
  { "key": "lance",       "label": "Lance",         "touchFormula": "VIG+AGI",   "damageFormula": "VIG+1", "price": 350, "encumbrance": 3, "hands": 2 }
]
```
