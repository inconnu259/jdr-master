# Sprint Change Proposal — 2026-08-19

**Déclencheur :** préparation de la story 36.5 « Les informations pratiques d'une séance » (épic 36, palier 9, dérogation D-15), statut `ready-for-dev`, **non implémentée**.
**Mode de revue :** batch.
**Classification :** **Modérée** — amendement de spec sans réorganisation de backlog.

---

## 1. Résumé du problème

`D-15` a été actée le 2026-08-17 sous la forme d'**un champ de texte libre unique** sur `Seance` (« chez Marc, 20 h 30 · pensez aux dés »). À la lecture de la story 36.5, l'utilisateur demande de le remplacer par **trois champs séparés** : une **heure de rendez-vous**, un **lieu**, et une **note libre**.

### Type de changement

**Nouvelle exigence émise par le porteur du produit** — pas une limite technique découverte, pas un malentendu sur l'exigence d'origine. La demande est arrivée avant toute écriture de code.

### Motifs invoqués

1. Un champ d'heure dédié peut n'accepter qu'un **format horaire** et offrir un **widget de saisie**, au lieu d'une frappe libre.
2. Un champ **Lieu** dédié agit comme un **rappel silencieux** au MJ — un champ vide qui attend une valeur se remplit ; une phrase libre laisse oublier.
3. Des champs séparés permettent de **choisir ce qu'on affiche quand la place manque** : titre + heure + lieu, en lâchant la note libre en premier.
4. Ils permettent d'ajouter l'heure au calendrier plus tard, si c'est jugé utile.
5. Ils permettent des **notifications ciblées** portant ces informations.

### Deux preuves recueillies dans les artefacts

**(a) Le rappel de séance par e-mail existe déjà et ne peut rien dire.** `apps/api/src/email/templates/session-reminder.hbs`, envoyé par `NotificationsService`, ne dispose que de :

```ts
{ partieName, sessionDate: formatSessionDate(date, slot), link }   // « jeudi 20 août, soir »
```

Il ne peut mentionner ni heure ni lieu, faute de données. Le motif n°5 n'est donc pas une projection : c'est un manque constaté dans du code livré.

**(b) ⚠️ Le contrat d'UI composait DÉJÀ trois morceaux distincts.** `mockups/contrat-ui-calendrier.html` :

```html
<!-- ligne 299 — vue Semaine -->
<div class="t">Le Convoi du Nord</div>
<div class="s">chez Marc</div>          <!-- le LIEU, sur sa propre ligne -->
<div class="s">20 h 30 · dés</div>      <!-- l'HEURE et la NOTE -->

<!-- ligne 296 — une séance qui n'a QU'UN LIEU -->
<div class="t">Les Cendres d'Ashal</div><div class="s">en visio</div>
```

**La planche validée et le texte du PRD étaient déjà en désaccord.** La maquette séparait le lieu de l'heure et montrait déjà une séance n'ayant qu'un lieu — donc des champs facultatifs et indépendants. Le changement demandé ne crée pas l'incohérence : **il la résout**, dans le sens qu'avait pris la maquette.

---

## 2. Analyse d'impact

### 2.1 Impact épic

| Point | Verdict |
| --- | --- |
| L'épic 36 se termine-t-il comme prévu ? | ✅ **Oui.** Aucune story ajoutée, retirée, renumérotée ni resequencée. |
| Épic 36 rendu obsolète ou à redéfinir ? | ✅ Non. |
| Nouveaux épics nécessaires ? | ✅ Non. |
| Priorité ou ordre à revoir ? | ✅ Non. |
| Autres épics du palier 9 touchés ? | ✅ Non — `D-15` n'est liée qu'à `FR-50`. |

**Seule la story 36.5 change de contenu.** Elle passe d'un champ à trois : un peu plus de travail (une migration à trois colonnes, un widget d'heure, une règle de composition), pas un changement de nature.

### 2.2 Impact story

| Story | Impact |
| --- | --- |
| **36.5** | **AC1 et AC2 à réécrire.** AC3/AC4 à adapter au pluriel. Le fichier de story `ready-for-dev` sera **réécrit** après approbation. |
| 36.11 (agenda refondu) | ✅ **Aucun.** Ses AC ne mentionnent pas les informations pratiques. |
| 36.13 (grille Semaine) | ✅ **Aucun changement de texte.** Son AC dit « *elle affiche son titre et ses informations pratiques* » (`epics.md:2471`) — la formule reste vraie, « informations pratiques » désignant désormais le trio composé. |
| 36.1, 36.2 | ✅ Livrées. Elles ont réservé l'emplacement sans le remplir ; le trio s'y pose aussi bien qu'un texte unique. |

### 2.3 Conflits d'artefacts

| Artefact | Statut | Nature |
| --- | --- | --- |
| `prd.md` FR-50, 3ᵉ puce | ❌ **Contredit** | « aucune notion d'heure […] aucun champ structuré de lieu » |
| `prd.md` D-15, ligne du tableau | ❌ **Contredit** | « Aucune notion de temps n'entre dans le modèle » |
| `addendum.md` §5.7 | ❌ **Contredit** | « pas de champ d'heure » |
| `epics.md` Story 36.5, AC1/AC2 | ❌ **Contredit** | AC2 interdit explicitement heure et lieu structuré |
| `EXPERIENCE.md` §4.3 bis | ❌ **Contredit** | « il n'existe ni champ d'heure, ni champ de lieu » |
| `mockups/contrat-ui-calendrier.html` | ✅ **Aucun** | Dessine déjà la composition — **pas de régénération** |
| `DESIGN.md` §7.9, §7.10 bis, §382 | ✅ **Aucun** | « Titre en gras, puis infos pratiques » reste vrai |
| `ARCHITECTURE-SPINE.md` | ✅ **Aucun** | `binds` s'arrête à FR-48 : aucune AD ne couvre l'épic 36 |
| `epics.md:335` (notes de l'épic) | ⚠️ **Mineur** | « champ libre d'informations pratiques » → « trois champs » |

### 2.4 Impact technique

- **Migration Prisma** : trois colonnes nullables au lieu d'une. Reste additif, sans reprise de données.
- **Chaîne de disponibilité** (`AD-9`, heatmap, dérivation d'indisponibilité, préséance) : ✅ **strictement inchangée** — voir §3.
- **`session-reminder.hbs`** : gagne un potentiel d'enrichissement. **Hors périmètre de la 36.5**, à ouvrir plus tard si voulu.
- **Sécurité** : trois champs texte réaffichés au lieu d'un. Même défense (échappement Angular), un champ de plus à borner.

---

## 3. Approche recommandée

### Option retenue : **Ajustement direct** (Option 1)

| Option | Verdict | Motif |
| --- | --- | --- |
| **1. Ajustement direct** | ✅ **Retenue** | Effort **faible à modéré**, risque **faible**. Rien n'est implémenté : le coût est celui d'une réécriture de spec et de story. |
| 2. Rollback | ❌ Sans objet | Aucun code à annuler — la 36.5 n'est pas implémentée. |
| 3. Revue du MVP | ❌ Non nécessaire | Le périmètre du palier 9 ne bouge pas. |

### La justification de fond : la demande respecte le *motif* de D-15, tout en contredisant sa *lettre*

C'est le cœur de cette proposition, et ce qui la rend acceptable sans renier la décision du 2026-08-17.

Le motif écrit dans `addendum.md` §5.7 est d'empêcher **un conflit d'agenda calculé à la minute** — parce que toute la chaîne de disponibilité (`AD-9`, heatmap, dérivation d'indisponibilité, préséance de `buildDayDetail`) raisonne en **créneau de journée** (`MORNING` / `AFTERNOON` / `EVENING` / `FULL_DAY`), jamais en instant. Une heure entrant dans le moteur y créerait une **seconde granularité temporelle que rien ne sait consommer**.

Il faut donc distinguer deux objets que le texte d'origine confondait :

| | Ce que c'est | Verdict |
| --- | --- | --- |
| **Heure-étiquette** | une chaîne `"20:30"` affichée et transmise. Rien ne la lit, ne la compare, ne la trie, ne la calcule. | ✅ **compatible avec le motif** |
| **Heure-modèle** | un `DateTime` entrant dans la détection de conflits, la heatmap, la dérivation d'indisponibilité | ❌ **c'est cela que D-15 interdit** |

La demande porte sur la première. **Le motif de D-15 survit intact** ; seule sa formulation, qui interdisait les deux d'un même souffle, doit être précisée.

### Gardes à inscrire dans la spec amendée

Ce sont elles qui font tenir la ligne, et elles doivent être écrites :

1. L'heure se stocke en **chaîne `"HH:MM"`** — jamais un `DateTime`, jamais un type `time` Prisma. *Une colonne typée « heure » invite mécaniquement le code suivant à calculer avec ; une chaîne, non.*
2. **Aucun code ne la parse, ne la compare, ne la trie**, ni ne la fait entrer dans la chaîne de disponibilité.
3. **Une seule heure**, jamais un début/fin : **la durée reste interdite**.
4. **Aucun fuseau horaire.**
5. Le **lieu** reste une chaîne courte **non structurée** — ni adresse, ni géocodage, ni lien de visio typé.
6. **Les trois champs sont facultatifs**, et une séance qui n'en porte aucun n'affiche ni ne réserve rien.

### Nommage retenu

| Champ | Type Prisma | Contenu |
| --- | --- | --- |
| `heureRdv` | `String?` | `"20:30"` — format validé, jamais interprété |
| `lieu` | `String?` | « chez Marc », « en visio » |
| `notePratique` | `String?` | « pensez aux dés » |

*« Informations pratiques » reste le nom du **trio**, comme dans toute la documentation ; il ne désigne plus un champ.*

---

## 4. Propositions d'édition détaillées

### Édition 1 — `prd.md`, FR-50, 3ᵉ puce (ligne 323)

**AVANT**
> - **Informations pratiques (D-15).** Une séance porte un **texte libre** rédigé par le MJ — où l'on joue, à quelle heure on se retrouve, quoi apporter. Ce n'est **pas** un modèle d'horaires : l'application ne gagne aucune notion d'heure, aucun calcul de durée, aucun champ structuré de lieu. Un texte, affiché tel quel.

**APRÈS**
> - **Informations pratiques (D-15).** Une séance porte trois informations facultatives, rédigées par le MJ : une **heure de rendez-vous**, un **lieu**, et une **note libre** — où l'on joue, à quelle heure on se retrouve, quoi apporter. Elles sont séparées pour trois raisons : l'heure peut être saisie par un sélecteur au lieu d'une frappe libre, un champ Lieu vide **rappelle** au MJ de le renseigner, et l'affichage peut **lâcher la note en premier** quand la place manque, en gardant l'heure et le lieu.
>   - **Ce n'est toujours pas un modèle d'horaires (amendé le 2026-08-19).** L'heure est une **étiquette**, pas un instant : une chaîne affichée et transmise, que **rien ne parse, ne compare, ne trie ni ne calcule**. Aucune durée, aucun fuseau, **aucun conflit d'agenda calculé à la minute**. L'unité d'arbitrage du calendrier reste le **créneau de journée**, et la chaîne de disponibilité est inchangée. Le lieu reste une chaîne non structurée — ni adresse, ni géocodage.

**Rationale :** la puce d'origine interdisait d'un même souffle l'heure-étiquette et l'heure-modèle. La nouvelle rédaction autorise la première, maintient l'interdiction de la seconde, et dit **pourquoi** les champs sont séparés.

---

### Édition 2 — `prd.md`, tableau des dérogations, ligne D-15 (ligne 431)

**AVANT**
> | D-15 | **Informations pratiques d'une séance** — texte libre du MJ (lieu, heure de rendez-vous, quoi apporter) | FR-50 | Faible — un champ texte, un point d'écriture MJ, le champ ajouté aux DTO du calendrier. **Aucune notion de temps n'entre dans le modèle** | ✅ actée |

**APRÈS**
> | D-15 | **Informations pratiques d'une séance** — trois champs facultatifs du MJ : heure de rendez-vous, lieu, note libre *(amendé le 2026-08-19 : un champ unique à l'origine)* | FR-50 | Faible à modérée — trois colonnes nullables, un point d'écriture MJ, les champs ajoutés aux DTO du calendrier. **L'heure est une étiquette, jamais un instant** : chaîne `"HH:MM"` que rien ne parse ni ne compare, aucune durée, aucun fuseau. **La chaîne de disponibilité reste au créneau de journée** | ✅ actée, amendée |

**Rationale :** la ligne du tableau est ce que les stories consultent en premier. Elle doit porter la garde, pas seulement l'autorisation.

---

### Édition 3 — `addendum.md`, §5.7 (lignes 114-116)

**AVANT**
> ### 5.7 Ce que « informations pratiques » n'est pas (D-15)
>
> `Seance` porte `dateValidee` et un créneau de la journée (`MORNING` / `AFTERNOON` / `EVENING` / `FULL_DAY`) — **aucune heure, aucun lieu, aucune durée**. La demande de l'utilisateur est explicitement un **texte libre** affiché tel quel, et non l'introduction d'un modèle horaire : pas de champ d'heure, pas de calcul de durée, pas de fuseau, pas de conflit d'agenda calculé à la minute. Un champ texte, un point d'écriture MJ dans la chronologie du scénario, une lecture sur le créneau et dans l'Agenda.

**APRÈS**
> ### 5.7 Ce que « informations pratiques » n'est pas (D-15) — *amendé le 2026-08-19*
>
> `Seance` porte `dateValidee` et un créneau de la journée (`MORNING` / `AFTERNOON` / `EVENING` / `FULL_DAY`). **Ce créneau reste la seule granularité temporelle du modèle.**
>
> La rédaction d'origine interdisait « tout champ d'heure ». Elle confondait deux objets qu'il faut séparer :
>
> | | Ce que c'est | Verdict |
> | --- | --- | --- |
> | **Heure-étiquette** | une chaîne `"20:30"` affichée et transmise ; rien ne la lit, ne la compare, ne la trie, ne la calcule | ✅ autorisée |
> | **Heure-modèle** | un `DateTime` entrant dans la détection de conflits, la heatmap, la dérivation d'indisponibilité | ❌ **interdite** |
>
> **Ce que D-15 interdit toujours, et qui est le vrai motif :** un **conflit d'agenda calculé à la minute**. Toute la chaîne (`AD-9`, heatmap, dérivation d'indisponibilité, préséance de la case) raisonne en créneau de journée ; une heure entrant dans le moteur y créerait une seconde granularité temporelle que rien ne sait consommer.
>
> **Gardes, opposables à toute story ultérieure :**
> 1. `heureRdv` est une **chaîne `"HH:MM"`** — jamais un `DateTime`, jamais un type `time` Prisma. *Une colonne typée « heure » invite le code suivant à calculer avec.*
> 2. Rien ne la parse, ne la compare, ne la trie, ni ne l'injecte dans la chaîne de disponibilité.
> 3. **Une seule heure**, jamais un début/fin — **la durée reste interdite**.
> 4. **Aucun fuseau horaire.**
> 5. `lieu` est une chaîne courte **non structurée** — ni adresse, ni géocodage.
> 6. Les trois champs sont **facultatifs**.
>
> Trois champs, un point d'écriture MJ dans la chronologie du scénario, une lecture sur le créneau et dans l'Agenda.

**Rationale :** l'addendum porte le **motif**, c'est-à-dire ce qui sera opposé aux demandes futures. C'est l'édition la plus importante des cinq : elle transforme une interdiction mal formulée en une garde précise et défendable.

---

### Édition 4 — `epics.md`, Story 36.5, AC1 à AC4 (lignes 2143-2162)

**AVANT**
> **Given** une séance
> **When** le MJ l'édite depuis la chronologie du scénario
> **Then** il peut saisir un **texte libre** d'informations pratiques
> **And** lui seul peut l'écrire
>
> **Given** ce champ
> **When** il est spécifié
> **Then** il n'introduit **aucune notion d'heure, de durée, de fuseau ni de lieu structuré**
> **And** aucun calcul n'est fait à partir de son contenu
>
> **Given** une séance portant ce texte
> **When** elle s'affiche sur un créneau, dans le rail ou dans l'agenda
> **Then** le texte est rendu **tel quel**, tronqué si la place manque
>
> **Given** une séance sans informations pratiques
> **When** elle s'affiche
> **Then** rien n'est réservé ni affiché à leur place

**APRÈS**
> *⚠️ AC1 et AC2 amendées le 2026-08-19 : la dérogation D-15 portait à l'origine **un seul champ de texte libre**. Elle en porte désormais **trois**, séparés — voir la proposition de changement du même jour.*
>
> **Given** une séance
> **When** le MJ l'édite depuis la chronologie du scénario
> **Then** il peut saisir une **heure de rendez-vous**, un **lieu** et une **note libre**, tous trois facultatifs
> **And** l'heure est saisie par un contrôle qui n'accepte qu'un format horaire
> **And** lui seul peut les écrire
>
> **Given** ces trois champs
> **When** ils sont spécifiés
> **Then** l'heure est une **étiquette** et non un instant — une chaîne que rien ne parse, ne compare, ne trie ni ne calcule
> **And** ils n'introduisent **aucune durée, aucun fuseau, aucun lieu structuré**
> **And** **aucun calcul** n'est fait à partir de leur contenu
> **And** la chaîne de disponibilité continue de raisonner au **créneau de journée**
>
> **Given** une séance portant ces informations
> **When** elle s'affiche sur un créneau, dans le rail ou dans l'agenda
> **Then** elles sont rendues **telles quelles**, tronquées si la place manque
> **And** quand la place manque, la **note libre cède la première**, l'heure et le lieu tenant plus longtemps
>
> **Given** une séance sans aucune de ces informations
> **When** elle s'affiche
> **Then** rien n'est réservé ni affiché à leur place
> **And** il en va de même pour chaque champ absent pris séparément

**Rationale :** AC1 gagne le contrôle de saisie formaté (motif n°1) ; AC2 est retournée sans perdre sa garde, et gagne la phrase qui protège la chaîne de disponibilité ; AC3 gagne l'**ordre de repli** (motif n°3) ; AC4 est étendue à chaque champ pris isolément, sans quoi une séance n'ayant qu'un lieu réserverait de la place pour les deux autres.

---

### Édition 5 — `EXPERIENCE.md`, §4.3 bis, paragraphe « Informations pratiques » (ligne 259)

**AVANT**
> **Informations pratiques.** Le texte libre d'une séance (« chez Marc · 20 h 30 · pensez aux dés ») s'affiche **tel quel et tronqué**, jamais reformaté : il n'existe ni champ d'heure, ni champ de lieu. Lecture sur le créneau et dans l'Agenda ; **écriture depuis la chronologie du scénario**, où la séance vit déjà.

**APRÈS**
> **Informations pratiques** *(amendé le 2026-08-19)*. Une séance porte trois informations facultatives — **heure de rendez-vous**, **lieu**, **note libre** — composées à l'affichage (« chez Marc · 20 h 30 · pensez aux dés ») et rendues **telles quelles et tronquées**, jamais reformatées. Quand la place manque, **la note cède la première** ; l'heure et le lieu tiennent plus longtemps. L'heure est une **étiquette**, jamais un instant : rien ne la calcule, et l'unité d'arbitrage du calendrier reste le créneau de journée. Lecture sur le créneau et dans l'Agenda ; **écriture depuis la chronologie du scénario**, où la séance vit déjà.

**Rationale :** ce paragraphe est la référence UX que les stories 36.5, 36.11 et 36.13 liront. Il porte désormais l'ordre de repli, qui est une règle d'affichage et non un détail d'implémentation.

---

### Édition 6 (mineure) — `epics.md:335`, notes d'implémentation de l'épic 36

**AVANT** : « `D-15` (champ libre d'informations pratiques sur `Seance`) »
**APRÈS** : « `D-15` (trois champs d'informations pratiques sur `Seance` — heure, lieu, note libre ; *amendé le 2026-08-19*) »

---

## 5. Ce qui NE change pas

À vérifier explicitement, parce que c'est la garantie que le changement reste contenu :

- ✅ **`AD-9`, la heatmap, `getSeanceDerivedUnavailability`, `computeSlotStatus`, `buildDayDetail`** — aucune modification. L'unité reste le créneau de journée.
- ✅ **`mockups/contrat-ui-calendrier.html`** — **aucune régénération** : la planche dessinait déjà la composition (preuve (b) du §1).
- ✅ **`DESIGN.md`** — §7.9, §7.10 bis et §382 restent vrais tels quels.
- ✅ **`ARCHITECTURE-SPINE.md`** — aucune AD ne couvre l'épic 36 (`binds` s'arrête à FR-48).
- ✅ **Les stories 36.11 et 36.13** — aucun changement de texte ; « informations pratiques » désigne désormais le trio.
- ✅ **Les stories 36.1 à 36.4** — livrées, non touchées.
- ✅ **Le périmètre du palier 9** — inchangé.

---

## 6. Plan d'action et passation

### Classification : **Modérée**

Amendement de spec + réécriture d'une story `ready-for-dev`. Pas de réorganisation de backlog, pas de replanification.

### Séquence

| # | Action | Artefacts | Qui |
| --- | --- | --- | --- |
| 1 | Appliquer les éditions 1 à 6 | `prd.md`, `addendum.md`, `epics.md`, `EXPERIENCE.md` | ce workflow, après approbation |
| 2 | **Réécrire** la story 36.5 | `36-5-les-informations-pratiques-dune-seance.md` | `bmad-create-story` (régénération) |
| 3 | Implémenter | code | `bmad-dev-story` |
| 4 | `/security-review` puis `/code-review` | — | **utilisateur** |

### Note sur l'étape 2

La story 36.5 existante reste largement valable — ses cinq encadrés, ses quatorze pièges et ses décisions arbitrées (longueur, rail mobile, vue Semaine hors périmètre) tiennent. **Trois blocs seulement changent** : les AC, la tâche de migration (trois colonnes), et la tâche de saisie MJ (un contrôle d'heure formaté). Le statut repasse à `backlog` le temps de la réécriture.

### Critère de succès

Les documents de planification **cessent de contredire** ce que le code fera, et la garde qui protège la chaîne de disponibilité est **écrite noir sur blanc**, opposable aux demandes futures.

---

## 7. Suivi

- ⚠️ **`session-reminder.hbs` peut désormais porter lieu et heure.** Hors périmètre de la 36.5 — à ouvrir comme une story dédiée si l'utilisateur le souhaite, l'infrastructure d'envoi étant déjà en place.
- ⚠️ **Rappel** : la story 36.5 porte déjà un écart assumé à `DESIGN.md:373` (le rail ne replie pas les informations pratiques sur téléphone), à répercuter par `bmad-ux`. **Indépendant de cette proposition.**
