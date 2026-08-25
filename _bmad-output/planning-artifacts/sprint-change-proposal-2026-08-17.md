# Sprint Change Proposal — 2026-08-17

**Projet :** jdr-master · **Palier 9** · **Épic 36 « Calendrier — lisibilité »**
**Portée :** Mineure — ajustement direct, aucun replanning
**Mode :** Batch

---

## 1. Résumé du problème

**Déclencheur.** La rédaction de la story **36.1 « Le rail de détail »** (`bmad-create-story`, 2026-08-17). L'analyse croisée des épics, du PRD, des spines UX et du contrat d'UI a fait apparaître **trois contradictions internes** entre des artefacts pourtant tous validés. Aucune n'était visible tant qu'aucune story ne cherchait à les implémenter simultanément.

**Catégorie :** *Misunderstanding of original requirements* — les exigences n'ont pas changé ; leur expression divergeait d'un artefact à l'autre.

**Les trois contradictions, avec leur preuve :**

| # | Contradiction | Où | Preuve |
| --- | --- | --- | --- |
| **A** | Le rail est-il permanent, ou disparaît-il au-delà de ~500 px ? | `epics.md` story 36.1 AC1 vs `EXPERIENCE.md` §9 vs contrat d'UI | AC1 : « visible **en permanence** ». `EXPERIENCE.md` §9 : « **Aucun** — tout est dans la cellule » ≥ 500 px. Le contrat ne dessinait aucun rail en Semaine desktop, **mais en dessinait un en Mois desktop**. Trois lectures pour un même composant. |
| **B** | Le rail nomme-t-il **trois** créneaux, ou seulement ceux qui portent quelque chose ? | `epics.md` story 36.1 AC2/AC4 vs contrat d'UI | AC2 : « il nomme **ses trois créneaux** ». AC4 : un jour vide « le dit explicitement ». Le rendu Mois mobile de la planche omettait la ligne « Matin / Disponible » — **deux lignes sur trois**. |
| **C** | Que fait le tap sur une entrée portant une séance ? | `EXPERIENCE.md` §6 bis, `epics.md` story 36.11 | Les deux disent « **la séance s'ouvre** ». Vérification dans le code : **aucun composant `SeanceDetail`, aucun dialogue, aucune route de séance**. Une séance n'a d'existence à l'écran qu'à l'intérieur de son scénario. Le seul lien existant va dans l'autre sens (`seance-list.ts:86` envoie le MJ *vers* le calendrier). L'AC désignait un écran inexistant. |

**Arbitrages rendus par l'utilisateur le 2026-08-17 :**

- **A** → *« on peut avoir le rail en desktop aussi, on pourra mettre plus d'info comme ça. »* Le rail est permanent à toutes les largeurs. Renversement de raisonnement : le rail n'est pas une compensation de l'étroitesse mobile, c'est une surface de lecture à part entière — donc d'autant plus utile qu'il y a de la place.
- **B** → *« Matin est important, il faut qu'il soit là aussi. »* Les trois créneaux sont toujours nommés. Un créneau vide porte l'information « tu es libre », ce que l'AC4 demandait déjà.
- **C** → *« le rail affiche les infos de la séance, et cliquer dessus affiche l'item juste au-dessus, donc le scénario. C'est plus cohérent. »* Règle générale : **une surface nomme une séance, l'activer ouvre le niveau au-dessus.**

---

## 2. Analyse d'impact

### Impact épic

**Épic 36 — modification de portée : aucune.** Les neuf FR couvertes, la séquence des quatorze stories, les quatre dérogations serveur et l'ordonnancement (après l'épic 30, avant l'épic 31) sont inchangés. L'épic reste réalisable tel que planifié.

**Aucun autre épic touché.** Les épics 31 à 35 ne mentionnent ni le rail ni l'ouverture d'une séance.

### Impact story

| Story | Statut | Impact | Action |
| --- | --- | --- | --- |
| **36.1** Le rail de détail | `ready-for-dev` | Les trois décisions sont **le cœur** de sa spécification | Story déjà écrite avec les trois décisions intégrées (AC1, AC2, AC11) — **aucune reprise** |
| **36.11** La vue Agenda refondue | `backlog` | ⚠️ Son AC « la séance s'ouvre » désigne un écran inexistant | **AC corrigée** |
| **36.13** La grille Semaine à densité variable | `backlog` | ⚠️ Son AC « le rail devient inutile » autorisait à escamoter le rail — contredit la décision A | **AC corrigée** |
| **36.2** La case du mois | `backlog` | Son AC10 s'appuie sur le rail livré par 36.1 — **renforcée**, pas contredite | Aucune |
| **36.5, 36.6, 36.8** | `backlog` | Alimentent le rail en contenus futurs (infos pratiques, compteur, noms) — le conteneur devient plus stable | Aucune |

**Aucune story livrée n'est remise en cause.** L'épic 30 est clos ; le rail est une surface neuve.

### Conflits d'artefacts

| Artefact | Conflit | Résolution |
| --- | --- | --- |
| `EXPERIENCE.md` §9 | Table de densité : « Aucun » détail ≥ 500 px | Corrigée (`bmad-ux`, mode Update) |
| `EXPERIENCE.md` §6 bis, table 2 | « Ouvrir une séance » | Corrigée + encadré ⚠️ posant la règle générale |
| `EXPERIENCE.md` §12, point 11 | Question ouverte sur la portée du rail | **Close** — le rail suit la dernière case touchée |
| `DESIGN.md` | **Aucune fiche de composant pour le rail** — trou réel | §7.10 bis `DetailRail` créée ; §7.10 `SlotIcon` étendue au rail |
| `mockups/contrat-ui-calendrier.html` | Rail absent en Semaine desktop ; rails à 1 et 2 créneaux | Révision 3 : rail ajouté, les quatre rails portent trois créneaux, annotations 27/28 corrigées, 37/38 neuves |
| `epics.md` | Stories 36.1, 36.11, 36.13 | **Objet de la présente proposition** |
| `prd.md` | FR-49 à FR-57 | **Aucun conflit** — le PRD ne descend pas à ce niveau de détail |
| `ARCHITECTURE-SPINE.md` | — | **Aucun conflit.** La spine déclare `binds: [FR-1 … FR-48]` : aucune AD ne couvre l'épic 36, le rail relève des conventions front |

### Impact technique

**Nul sur l'existant.** Story front pure : aucun changement de modèle, d'API, de migration ni de contrat partagé. La décision C ajoute une navigation vers une route **déjà existante** (`parties/:id/scenarios/:scenarioId`) et interdit explicitement de créer un composant de détail de séance. La décision A supprime au contraire un travail prévu — plus de media query d'escamotage à écrire.

---

## 3. Approche recommandée

**Ajustement direct (*Direct Adjustment*).** Corriger les AC des stories 36.11 et 36.13 dans `epics.md`, expliciter les trois décisions sur 36.1, et documenter la révision du contrat en tête d'épic.

**Justification.** Les trois points sont des **précisions d'expression**, pas des changements de besoin. Aucune exigence fonctionnelle ne bouge, aucun périmètre ne s'élargit, aucun travail livré n'est invalidé. Un rollback n'aurait rien à annuler ; une revue de MVP n'aurait rien à réduire.

**Effort :** édition documentaire, ~30 minutes. **Risque :** faible — le risque réel était de *ne pas* corriger : les stories 36.11 et 36.13 auraient été implémentées contre des AC contradictoires avec 36.1, sur les mêmes fichiers. **Impact calendrier :** aucun.

---

## 4. Propositions de changement détaillées

### 4.1 `epics.md` — Story 36.1 (AC1)

**AVANT**
```
**Then** un rail de détail est visible **en permanence** sous la grille
```
**APRÈS**
```
**Then** un rail de détail est visible **en permanence** sous la grille,
**à toutes les largeurs — téléphone, tablette et ordinateur**
```
*Justification :* lève l'ambiguïté avec `EXPERIENCE.md` §9. « En permanence » se lisait comme temporel ; la précision le rend aussi spatial.

### 4.2 `epics.md` — Story 36.1 (AC2)

**AVANT**
```
**And** il nomme ses trois créneaux et ce que chacun porte
```
**APRÈS**
```
**And** il nomme ses trois créneaux et ce que chacun porte
**And** les trois sont **toujours** nommés — un créneau qui ne porte rien dit son état, il ne disparaît pas
```
*Justification :* le rendu mobile du contrat prouve que « ses trois créneaux » pouvait se lire « ceux qui portent quelque chose ».

### 4.3 `epics.md` — Story 36.1 (deux AC ajoutées)

**AJOUT**
```
**Given** une ligne du rail qui porte une séance
**When** je la tape
**Then** le **scénario** qui porte cette séance s'ouvre
**And** une ligne qui ne porte rien d'ouvrable n'est pas cliquable et ne s'en donne pas l'air

**Given** une largeur d'écran confortable
**When** le rail est rendu
**Then** il déplie ce que la case abrège
**And** la largeur ne le fait jamais disparaître
```
*Justification :* la décision C entre dans le périmètre de 36.1 ; la seconde AC pose que la largeur enrichit au lieu de retirer.

### 4.4 `epics.md` — Story 36.1 (encadré ⚠️ en tête)

**AJOUT** d'un encadré nommant les trois décisions, la révision 3 de la planche et la correction de `EXPERIENCE.md` §9.
*Justification :* la convention de l'épic impose de signaler par ⚠️ tout écart à la cible dessinée.

### 4.5 `epics.md` — Story 36.11 (AC « la séance s'ouvre »)

**AVANT**
```
**Then** la séance s'ouvre
```
**APRÈS**
```
**Then** le **scénario** qui porte cette séance s'ouvre — ⚠️ *précisé le 2026-08-17 : la formulation
d'origine supposait un écran de séance qui n'existe pas. Règle générale : une surface nomme la séance,
l'activer ouvre le niveau au-dessus. Même cible que l'AC correspondante de la story 36.1.*
```
*Justification :* **la correction la plus importante du lot.** Sans elle, un agent implémentant 36.11 aurait pu construire un écran de séance pour satisfaire une AC littérale — une refonte non demandée, incohérente avec 36.1.

### 4.6 `epics.md` — Story 36.13 (AC « le rail devient inutile »)

**AVANT**
```
**And** le rail devient inutile
```
**APRÈS**
```
**And** le rail **demeure** et déplie ce que la cellule abrège — ⚠️ *corrigé le 2026-08-17 : cette AC
autorisait à l'escamoter. Tranché : le rail est permanent à toutes les largeurs (story 36.1). Ce qui
varie avec la largeur est la densité de la **cellule**, jamais la présence du rail.*
**And** aucune règle de cette story ne masque le rail
```
*Justification :* « inutile » est une appréciation, pas un comportement — elle laissait 36.13 libre de supprimer ce que 36.1 rend permanent, sur les mêmes fichiers.

### 4.7 `epics.md` — En-tête de l'épic 36

**AJOUT** d'un paragraphe « Révision 3 de la planche, 2026-08-17 » sous la convention de lecture du contrat d'UI.

### 4.8 Artefacts UX — **déjà appliqués** (`bmad-ux`, mode Update)

- `EXPERIENCE.md` : §9 table + deux encadrés ⚠️ ; §6 bis table 2 + encadré de la règle générale ; points ouverts 8 amendé et **11 clos**.
- `DESIGN.md` : **§7.10 bis `DetailRail` créée** (le composant n'avait aucune fiche) ; §7.10 `SlotIcon` étendue au rail.
- `mockups/contrat-ui-calendrier.html` : révision 3 — rail ajouté en Semaine desktop, les quatre rails portent trois créneaux, annotations 27 et 28 corrigées, 37 et 38 neuves, numérotation et balisage vérifiés.
- Six entrées ajoutées au memlog UX.

---

## 5. Handoff

**Classification : Mineure.** Implémentation directe par l'agent développeur, aucune réorganisation de backlog, aucune escalade PM/Architecte.

| Destinataire | Livrable | Responsabilité |
| --- | --- | --- |
| **Agent dev** (`bmad-dev-story`) | Story `36-1-le-rail-de-detail.md`, `ready-for-dev` | Implémenter les onze AC. La story porte déjà les trois décisions |
| **`bmad-create-story`**, plus tard | Stories 36.11 et 36.13 | Rédiger contre les AC **corrigées** — les ⚠️ sont dans `epics.md` |
| **Aucun** | PRD, architecture | Non touchés, aucun conflit |

**Critères de succès**

1. La story 36.1 s'implémente sans rouvrir aucune des trois questions.
2. Les stories 36.11 et 36.13, rédigées plus tard, ne contredisent ni 36.1 ni le contrat d'UI.
3. Aucun composant de détail de séance n'est créé dans l'épic 36.
4. Aucune règle de masquage du rail n'apparaît dans 36.13.

**Aucun statut de sprint ne change.** 36.1 reste `ready-for-dev` ; 36.11 et 36.13 restent `backlog`.

---

## 6. Checklist de navigation du changement

| § | Item | Statut |
| --- | --- | --- |
| 1.1 | Story déclencheuse identifiée — 36.1, pendant `bmad-create-story` | [x] |
| 1.2 | Problème défini — divergence d'expression entre artefacts validés | [x] |
| 1.3 | Preuves collectées — citations d'artefacts + vérification dans le code (aucun écran de séance) | [x] |
| 2.1 | Épic 36 réalisable tel que planifié | [x] |
| 2.2 | Changements d'épic — aucun ; portée, séquence et dérogations inchangées | [x] |
| 2.3 | Autres épics — aucun impact | [N/A] |
| 3.x | Conflits d'artefacts — PRD sans conflit ; UX corrigés ; **DESIGN.md avait un trou réel, comblé** ; architecture hors périmètre (`binds` s'arrête à FR-48) | [x] |
| 4.x | Chemin retenu — ajustement direct ; rollback et revue de MVP sans objet | [x] |
| 5.x | Propositions rédigées et appliquées (§4) | [x] |
| 6.x | Handoff — portée mineure, agent dev | [x] |
| — | **Suivi** — la spine d'architecture ne couvre pas FR-49 à FR-57 (`binds: [FR-1 … FR-48]`). Sans conséquence pour 36.1, mais **les quatre dérogations serveur D-15 à D-18 n'ont aucune AD** ; à traiter avant les stories 36.4, 36.5, 36.6 et 36.10 | [!] |
