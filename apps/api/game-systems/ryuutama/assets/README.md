# Assets Ryuutama

Ce dossier attend, gitignoré (contenu sous droits d'auteur — fiche officielle éditée par
l'éditeur du jeu, cf. NFR4-équivalent Story 4.4), le fichier PDF source utilisé pour
l'export de fiche de personnage (`GET /characters/:id/export.pdf`) :

```
apps/api/game-systems/ryuutama/assets/
  Ryuutama_fiche_de_voyageur_big_edit.pdf
```

## Ryuutama_fiche_de_voyageur_big_edit.pdf

Fiche de voyageur officielle (2 pages), seule version des 3 fournies par l'éditeur à
posséder de vrais champs de formulaire AcroForm remplissables par nom de champ
(`pdf-lib`). Les deux autres versions (`Ryuutama_voyageur.pdf` 1 page paysage et
`Ryuutama_voyageur_big.pdf` 2 pages) sont purement visuelles, sans champ — non utilisées
ce palier.

Sans ce fichier, `GET /characters/:id/export.pdf` échoue avec une erreur explicite
pointant vers ce README (voir `RyuutamaPdfService`).

Le mapping champ métier → nom de champ AcroForm est documenté et testé dans
`packages/game-rules/src/ryuutama/pdf-field-map.ts`.

## Ryuutama-fiche_equipement_edit.pdf (Story 11.1)

Fiche d'équipement officielle (1 page, 94 champs AcroForm, tous `PDFTextField`), utilisée pour
l'export `GET /characters/:id/export-equipment.pdf`. Sans ce fichier, l'export échoue avec une
erreur explicite pointant vers ce README (voir `EquipmentPdfService`).

Le mapping champ métier → nom de champ AcroForm est documenté et testé dans
`packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts`. Le template propose 21
emplacements Objet/Prix/Enc/Effets pour l'équipement individuel (Effets limité aux 5 premiers,
limite physique du template), plus des blocs « Contenant » et « Animal » (3 emplacements chacun,
Objet/Prix/Enc/Effets pour Contenant, Objet/Prix/Effets — pas d'Enc — pour Animal, cf. Story
14.3) désormais alimentés depuis `RyuutamaSheetData.equipment.{contenants,animaux}`. Seul le
champ « Po » (monnaie) n'a aucune donnée correspondante dans le modèle actuel et reste
volontairement vide (hors scope PRD §4.2).

## Ryuutama_fiche_de_notes_edit.pdf (Story 11.2)

Fiche de notes officielle (1 page, 42 champs AcroForm, tous `PDFTextField`), utilisée pour
l'export `GET /characters/:id/export-notes.pdf`. Sans ce fichier, l'export échoue avec une
erreur explicite pointant vers ce README (voir `NotesPdfService`).

Le mapping champ métier → nom de champ AcroForm est documenté et testé dans
`packages/game-rules/src/ryuutama/notes-pdf-field-map.ts`. Contrairement aux 3 autres templates
PDF déjà exploités dans ce projet, celui-ci **n'a aucun champ d'en-tête** (`joueur`/`voyageur`
absents) — uniquement 21 lignes `Note.{0..20}.{0|1}` (colonne `.0` = date, colonne `.1` = texte
de l'entrée). Au-delà de 21 notes, les entrées excédentaires sont omises silencieusement (limite
physique du template).

## Zone du portrait (Story 4.6)

Le portrait du personnage (s'il existe) est dessiné directement sur la page 1 — ce n'est
**pas** un champ AcroForm (aucun champ de type image sur ce template), donc pas de nom de
champ à mapper : positionnement en dur par coordonnées dans
`apps/api/src/characters/ryuutama-pdf.service.ts` (constantes `PORTRAIT_X/Y/WIDTH/HEIGHT`).

Page 1 : 595.276 × 841.89 pt (A4 portrait). Coordonnées (origine bas-gauche, comme pdf-lib) :

| Constante | Valeur | Repère utilisé |
|---|---|---|
| `PORTRAIT_X` | 451 | aligné sur le bord gauche du champ `Joueur` (x:450.96) |
| `PORTRAIT_Y` | 662 | juste au-dessus des champs `créé le`/`Homme dragon` (y:641.93, hauteur 15.7) |
| `PORTRAIT_WIDTH` | 90 | largeur du champ `Joueur` |
| `PORTRAIT_HEIGHT` | 110 | ratio portrait (plus haut que large), rentre sous le titre (marge ~70pt en haut de page) |

Ces valeurs ont été déduites des coordonnées des champs AcroForm voisins (mesurées via
`page.getRectangle()` de pdf-lib) — **pas vérifiées par un rendu visuel du PDF final**
(aucun visualiseur PDF disponible à l'implémentation). Vérifiées fonctionnellement : l'image
s'intègre bien sur la page (XObject `/Image` présent dans les ressources), mais son
positionnement exact par rapport au titre/logo imprimé n'a pas été confirmé à l'œil. **Si un
décalage est constaté à l'usage, ajuster ces 4 constantes** dans `ryuutama-pdf.service.ts`
plutôt que de redécouvrir ces repères depuis zéro.
