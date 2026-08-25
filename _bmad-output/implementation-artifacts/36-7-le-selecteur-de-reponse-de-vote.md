---
baseline_commit: fca3ffda8a389171db091106c037346a5c8a26a6
---

# Story 36.7 : Le sélecteur de réponse de vote

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Front pur — aucun changement serveur, aucune migration** · porte **FR-51** (avec la 36.6) et **FR-35** [Source: epics.md:1906, epics.md:1923]

> **La 36.6 a livré la lecture ; celle-ci livre l'écriture.** Tout ce dont le sélecteur a besoin est déjà en mémoire — `pollId`, `optionId`, `myAnswer`, les compteurs, l'effectif — dans les deux contextes. Les deux routes serveur existent depuis les stories 8.8 et 30.1 et n'ont **pas** à bouger.

---

## Story

As a **joueur**,
I want **répondre à un vote depuis le calendrier en un geste clair**,
so that **je n'aie pas à retrouver un panneau séparé**.

---

## 🚨 Encadré n°0 — LE DÉPÔT EST CASSÉ : cinq fichiers de la 36.6 ne sont pas suivis par git

**À vérifier et à corriger AVANT toute autre chose.** `git status` au démarrage de cette story :

```
?? apps/api/src/parties/participant-count.util.ts
?? apps/api/src/parties/participant-count.util.spec.ts
?? apps/web/src/app/features/calendar/poll-track.utils.ts
?? apps/web/src/app/features/calendar/poll-track.utils.spec.ts
?? apps/web/src/app/features/calendar/poll-track/
```

`git ls-files` ne les connaît pas ; le commit `fca3ffd` (« feat: la piste de participation d'un vote ») ne les contient pas. **Un clone frais du dépôt ne compile pas** : `availability.service.ts` importe `participantCount`, `calendar-month-view.ts` importe `PollTrack`. Tout marche ici uniquement parce que les fichiers existent sur le disque.

**Conséquences directes sur cette story :**
- La « baseline mesurée sur un arbre propre » n'est pas mesurable telle quelle — l'arbre n'est pas propre.
- 🚨 **Ne JAMAIS lancer `git stash` pour comparer un relevé de lint** (procédure employée par la 36.6) tant que ces fichiers ne sont pas ajoutés : `git stash` sans `-u` les laisse en place, avec `-u` il les emporte et **le projet ne compile plus**.

**Task 0 traite ce point, en premier, isolément.**

---

## 🚨 Encadré n°1 — Le tap a déjà deux sens ; cette story lui en donne un troisième, et l'ordre d'arbitrage est tout le sujet

Les deux grilles convergent sur **une seule fonction**, `onCellClick(date, slot)` — `calendar-month-view.ts:387` et `calendar-week-view.ts:459`. En vue Semaine il n'existe **aucun** `(click)` dans le template : le tap est synthétisé par `onGridPointerUp()` (`:656`) quand le geste n'a pas armé. **C'est le seul point d'entrée à toucher, dans les deux vues.** N'en ouvrir aucun autre.

Ce que fait `onCellClick` aujourd'hui, dans l'ordre :

1. rejette les dates passées / hors mois ;
2. **émet `slotSelected` → le rail suit** (36.1, AC2) ;
3. avale le clic parasite d'un geste armé (`suppressNextClick`) ;
4. **si une sélection est ouverte, bascule le créneau touché** (36.3, AC17/AC18).

**L'ordre à respecter, écrit une fois :**

| # | Condition | Effet |
| --- | --- | --- |
| 1 | Date passée / hors mois | Rien (inchangé) |
| 2 | — | **Le rail suit, TOUJOURS** — même quand le sélecteur s'ouvre. Le rail suit, il ne se commande pas |
| 3 | `suppressNextClick` | Rien (clic parasite d'un geste armé) |
| 4 | **Une sélection est ouverte** | **Bascule du créneau — JAMAIS le sélecteur.** Le mode a déjà réassigné le tap (36.3 ; collision 5 : un mode, et un seul, réassigne le geste) |
| 5 | Le créneau porte une option de vote **au rang gagnant**, couche allumée | **Le sélecteur s'ouvre**, ancré sur la bande |
| 6 | Sinon | Lecture seule (comportement actuel) |

> **Ce n'est PAS une divergence de la 36.3.** Son AC1 dit « une case ou une bande **sans objet posé** » — la bande à objet en était déjà exclue en droit, l'implémentation ne faisait simplement pas la distinction. `EXPERIENCE.md` §6 bis, table 1, dit depuis le 2026-08-17 : « Tap sur une bande portant une **option de vote** → ouvre le **sélecteur de réponse** », et la collision 4 l'arbitre explicitement contre « tap = oui » et contre le cycle. **Cette story complète le contrat, elle ne le renverse pas.**
>
> **Ce qui NE change pas :** l'appui maintenu sur une bande à objet **arme toujours la sélection** (collision 6 — « les durées séparent : tap court ouvre, maintenu arme »). Ne toucher ni au minuteur, ni à `armDrag`, ni au seuil de 8 px.

---

## 🚨 Encadré n°2 — Le second chemin de retrait existe, il est DANS le calendrier, et l'AC3 exige sa disparition

`calendar-view.html:197` rend `<app-poll-response>` dans le panneau latéral joueur, un par vote actif. Ce composant porte **les deux** chemins que le sélecteur reprend : les boutons oui/non/peut-être (`setAnswer` + `onConfirm`) **et** « Retirer » (`withdraw()`, `poll-response.ts:194`).

⚠️ **Décision de cette story : `<app-poll-response>` est retiré du calendrier**, et de lui seul.

- **Retiré** : `calendar-view.html:184-201` (le bloc `@for` du panneau joueur) et l'import `PollResponseComponent` de `calendar-view.ts:117`.
- **Intact, non touché** : `seance-list.html:180` et `:236` (fiche de scénario) et `scenario-read-dialog`. Le composant **continue d'exister** et de servir hors du calendrier. L'AC3 dit « dans le calendrier », pas « dans l'application ».
- **Ce qui remplace la lecture perdue** : la grille nomme désormais chaque créneau proposé et porte sa piste (36.6, AC8) ; le rail et l'Agenda portent le compteur et ma réponse en toutes lettres. La liste de créneaux groupés par jour du panneau est exactement ce que la **36.9** doit faire disparaître (« le panneau se réduit aux membres qui n'ont pas répondu et à ceux qui ont répondu »). Cette story en retire la moitié joueur ; la 36.9 fera le reste.
- **Le panneau MJ n'est pas touché** : `app-poll-status` ne porte aucun chemin de réponse ni de retrait — il sert à **sceller** (`chosen`), ce qui appartient à la 36.12.

🚨 **Le MJ vote, lui aussi.** `castVote` garde par `getViewable` (`poll.service.ts:100`), et la 36.6 a tranché que l'effectif compte le MJ **parce qu'il vote réellement**. Le sélecteur s'ouvre donc pour **tout membre viewable, MJ compris** — jamais conditionné à `isMjMode()`. C'est aussi la seule façon, après ce retrait, qu'un MJ ait un chemin de réponse dans le calendrier : il n'en avait aucun.

---

## 🚨 Encadré n°3 — Il manque UNE donnée pour agir : `partieId`

Les deux routes sont scopées à la partie :

```
POST   /parties/:partieId/poll/:pollId/vote          { optionId, answer }   (poll.controller.ts:49)
DELETE /parties/:partieId/poll/:pollId/vote/:optionId                        (poll.controller.ts:63)
```

`VoteParticipation` (`poll-track.utils.ts:26-38`) porte `pollId` et `optionId` — **pas `partieId`**. En contexte de partie il est trivial (`this.partieId()`), mais le **calendrier personnel agrège plusieurs parties** : chaque entrée a la sienne, et rien ne la porte jusqu'à la bande.

**Décision : `partieId: string` est ajouté à `VoteParticipation`, requis.** C'est le triplet d'identité complet de l'action ; le séparer obligerait chaque surface à recomposer une cible, c'est-à-dire à réécrire la dérivation que la 36.6 a rendue unique.

Les deux points d'alimentation existent déjà et ont la donnée sous la main :
- `calendar-view.ts:~330` (contexte de partie) → `partieId: pid`
- `calendar-view.ts:~415` (personnel) → `partieId: p.partieId` (`MyCalendarPollEntry.partieId`, `shared/index.ts:665`)

🚨 **Requis, jamais optionnel** — même raisonnement que `membersCount` en 36.6 : le compilateur doit casser sur toute fixture de test qui l'oublie, sinon une surface enverrait un `undefined` dans une URL. Attendre des échecs de compilation dans `poll-track.utils.spec.ts`, `calendar-view.spec.ts`, `day-detail.utils.spec.ts`, `calendar-month-view.spec.ts`, `calendar-week-view.spec.ts`, `calendar-detail-rail.spec.ts`, `calendar-agenda-view.spec.ts`, `poll-track.spec.ts`. **C'est voulu.**

Aucun changement de `packages/shared` : `VoteParticipation` est un type **front**.

---

## 🚨 Encadré n°4 — Le clavier n'atteint pas les bandes. Le rail est le chemin d'accès, et il n'est pas optionnel

Les bandes du Mois **ne sont pas focalisables**, par décision explicite : un `tabindex` par bande produirait 126 arrêts de tabulation sur une grille de six semaines (`calendar-month-view.html:76-79`, `EXPERIENCE.md` §6 bis). Les touches de la case (`1`/`2`/`3`, `Espace`) **arment une sélection** — elles ne peuvent pas ouvrir le sélecteur sans détruire le geste de déclaration.

⇒ **La ligne de vote du rail devient un vrai `<button>`, exactement comme la ligne de séance l'est déjà** (`calendar-detail-rail.html:44`, story 36.1 AC11). C'est :
- le **seul** chemin clavier vers la réponse dans les vues de grille ;
- cohérent avec ce qui existe (aucune convention nouvelle) ;
- gratuit en focus : le rail porte au plus trois lignes.

Le rail est un **composant de rendu pur** (36.1) : il n'appelle rien. Il émet un `output` — `voteOptionActivated` — que `CalendarView` traite, comme `scenarioActivated`.

**L'Agenda** : la ligne d'une entrée `votes-en-cours` devient activable de la même façon (elle est déjà une `<li>` ; poser un `<button>` sur son contenu). Table 1 d'`EXPERIENCE.md` dit « Idem » pour l'Agenda.

**Où le sélecteur s'ouvre, et depuis quoi :**

| Surface | Déclencheur | Ancre |
| --- | --- | --- |
| Case du Mois | tap sur la bande dont le rang gagnant est `vote` | la bande (`.band`) |
| Cellule de Semaine | tap sur la cellule dont le rang gagnant est `vote` | la cellule (`.slot-cell`) |
| Rail de détail | activation de la ligne de vote (souris **et** clavier) | le bouton de la ligne |
| Agenda | activation de la ligne `votes-en-cours` | le bouton de la ligne |

---

## 🚨 Encadré n°5 — L'ancrage : CDK Overlay, sans aucun précédent dans ce projet

`@angular/cdk@22.0.2` est installé (dépendance de Material) mais **aucun `CdkConnectedOverlay`, aucun `MatMenu` n'existe aujourd'hui dans `apps/web`** — vérifié par recherche. Le seul patron de surface flottante du projet est `MatDialog` (`conflict-dialog`, `confirm-dialog`), **qui ne convient pas** : le contrat dit « **ancré sur cette bande** » (`contrat-ui-calendrier.html:634`), pas centré à l'écran.

**Recommandation : `cdkConnectedOverlay`, déclaratif, dans le template de `CalendarView`.** Un seul sélecteur pour les quatre surfaces — jamais un par vue.

```html
<ng-template
  cdkConnectedOverlay
  [cdkConnectedOverlayOrigin]="pickerAnchor()!"
  [cdkConnectedOverlayOpen]="pickerOpen()"
  [cdkConnectedOverlayHasBackdrop]="true"
  (backdropClick)="closePicker()"
  (detach)="closePicker()"
  (overlayKeydown)="onPickerKeydown($event)">
  <app-vote-answer-picker … />
</ng-template>
```

Faits vérifiés (Context7, doc Material/CDK à jour) :
- `cdkConnectedOverlayOrigin` accepte `CdkOverlayOrigin | FlexibleConnectedPositionStrategyOrigin` — donc **un `ElementRef` ou un `Element` brut**, ce qui permet d'ancrer sur une bande désignée dynamiquement, sans directive posée sur chacune des 126 bandes.
- Sorties disponibles : `backdropClick`, `detach`, `overlayKeydown`, `overlayOutsideClick`, `positionChange`.
- Entrées utiles : `cdkConnectedOverlayPositions` (liste ordonnée de positions de repli — indispensable : une bande en bas d'écran doit ouvrir vers le haut), `cdkConnectedOverlayPush`, `cdkConnectedOverlayViewportMargin`.

🚨 **Pièges de cette technique, tous à traiter :**
1. **Le sélecteur ne vit PAS dans `fixture.nativeElement`.** L'overlay est rendu dans le conteneur d'overlay attaché à `document.body`. **Tout test qui le cherche dans le fixture trouvera `null` et passera pour une mauvaise raison** si l'assertion est négative. Interroger `document.body`, et **nettoyer le conteneur entre les tests** (`OverlayContainer.ngOnDestroy()` ou retrait du nœud) — sinon les sélecteurs fuient d'un test à l'autre.
2. **Focus.** À l'ouverture, poser le focus dans le sélecteur (`cdkTrapFocus` de `@angular/cdk/a11y`, ou un `focus()` sur la première entrée) ; à la fermeture, **le rendre à l'élément d'ancrage** — sinon un utilisateur clavier retombe en haut du document.
3. **`Échap` ferme sans rien changer** (AC4) : c'est `overlayKeydown`, pas un `keydown.escape` sur la grille — celle-ci a déjà le sien, qui **annule la sélection** (`calendar-month-view.html:41`). Ne jamais laisser l'un déclencher l'autre.
4. **Le backdrop avale le clic suivant** : c'est ce qu'on veut (fermer sans agir), mais vérifier à l'œil qu'un second tap sur une autre bande ne se perde pas silencieusement.
5. **Zoneless** : l'overlay est instancié hors du cycle du composant hôte. Les tests devront faire tourner la boucle de ticks établie du projet, pas `whenStable()` seul.

*Alternative si l'overlay résiste : `MatMenu` ouvert par `MatMenuTrigger.openMenu()` sur un déclencheur invisible positionné sur l'ancre. Il offre focus roving, `Échap`, backdrop et rôles ARIA sans code — au prix d'un déclencheur fantôme à positionner. **Trancher et commenter le choix**, ne pas hésiter à mi-chemin.*

---

## 🚨 Encadré n°6 — Ce qui se passe APRÈS le clic : deux contextes, deux rafraîchissements

| | Contexte de partie | Calendrier personnel |
| --- | --- | --- |
| Source de la piste | `activePolls()` ← `scenarios()` | `meCalendar()` |
| Après une écriture | `await this.loadScenarios(id)` | `await this.loadMeCalendarForRange(this.fromDateStr(), this.toDateStr())` |
| Temps réel | ✅ `castVote`/`withdrawVote` émettent sur `partieTopic` (`poll.service.ts:118`, `:154`) → l'effet sur `scenariosSvc.changed()` recharge (`calendar-view.ts:487-497`) | ❌ `GET /me/calendar` n'est **pas** câblé sur SSE (`deferred-work.md:39`) — le rechargement explicite est le **seul** moyen |

**Patron à reprendre tel quel : `onChooseDate()` / `onClosePoll()` (`calendar-view.ts:928`, `:911`)** — garde `pollActionPending`, `try/catch`, message d'erreur, rechargement. Ne pas inventer un troisième style.

🚨 **Ne pas recopier la mise à jour optimiste de `PollResponseComponent`.** Elle reconstruit un `SessionPollDto` complet à la main (`poll-response.ts:150-170`) parce qu'elle vit **dans** la fiche de scénario, sans rechargement à disposition. Ici, `loadScenarios()` existe, coûte un appel sur une **action utilisateur** (jamais au rendu — l'AC7 de la 36.6 porte sur l'affichage, il n'est pas menacé) et garantit que les quatre surfaces disent la même chose. *Si l'on veut malgré tout l'optimisme, l'ajouter **en plus** du rechargement, jamais à sa place.*

🚨 **Le rechargement doit rester honnête en cas d'échec.** Un vote peut être **clos entre l'affichage et le tap** : le serveur répond alors `400 Poll introuvable ou fermé`. La réponse ne doit apparaître nulle part, et l'écran doit se remettre à jour (le créneau cesse d'être une option). Idem `403` sur une partie quittée.

---

## 🚨 Encadré n°7 — Ce que le sélecteur affiche, au pixel

`contrat-ui-calendrier.html:198-203` (le `.picker`) et `:626-636` (son contenu) :

```css
.picker{background:var(--sys-container);border:1px solid var(--jdr-status-todo);border-radius:10px;
  padding:var(--sp2);box-shadow:0 10px 30px rgba(0,0,0,.7);width:215px}
.picker .opt2{display:flex;align-items:center;gap:var(--sp2);padding:6px 8px;border-radius:6px;font-size:12.5px}
.picker .opt2.sel{background:rgba(126,200,164,.16)}
.picker .opt2 i{width:9px;height:9px;border-radius:50%;flex:0 0 9px}
.picker .sep{height:1px;background:rgba(255,255,255,.1);margin:4px 0}
```

Structure : un **en-tête qui nomme le créneau** (« Ven 28 août — soir »), puis **Oui** / **Peut-être** / **Non**, chacun précédé d'une pastille (`--color-available` / `--jdr-status-todo` / `--color-unavailable`), l'entrée courante marquée `.sel` ; un séparateur ; **« Retirer ma réponse »** en `--jdr-text-muted`.

- **La pastille de couleur ne porte rien seule** (P-1) : le mot est là, et `.sel` est un **fond**, pas seulement une teinte de texte. Le nom accessible de l'entrée courante doit dire qu'elle est choisie (`aria-checked` / `aria-current`), jamais la seule couleur.
- **« Retirer ma réponse » n'apparaît que si j'ai réellement répondu** — `myAnswer !== null`. C'est le fait que `PollResponseComponent` avait dû apprendre en revue (`confirmedOptionIds`, `poll-response.ts:56-62`) : proposer un retrait sur une réponse jamais posée n'a rien à retirer.
- **L'ordre des trois entrées est celui du contrat : oui, peut-être, non.** `PollResponseComponent.VOTE_OPTIONS` dit `['YES','NO','MAYBE']` — **ne pas le recopier**, c'est un autre écran et un autre ordre.
- Les mots viennent d'`answerLabel()` (`poll-track.utils.ts:112`), déjà le point unique du vocabulaire (« oui », « peut-être », « non »). **Ne pas en écrire un second.**
- Les messages de succès/erreur passent par `ThemeToneService` : `success.vote_cast`, `success.vote_withdrawn`, `poll.withdraw_error` **existent déjà** dans les trois thèmes (`tones.ts:179-183`, `:475-479`, `:766-770`). Aucune clé nouvelle sauf besoin avéré ; si une clé manque, la poser **dans les trois thèmes**.

---

## 🚨 Encadré n°8 — Le contrat DOM du glissement, que rien ne teste

Rappel de la 36.13 / 36.6 : le hit-test du glissement fait `elementFromPoint(...).closest('[data-cell-date]')`. Tout nœud ajouté dans une cellule doit **rester descendant de `.slot-cell` / `.day-cell`** et, s'il n'est pas la cible du geste, porter `pointer-events: none`. La piste (`app-poll-track`) le fait déjà.

**Le sélecteur, lui, est hors de la grille** (conteneur d'overlay sur `document.body`) : il ne peut pas casser le hit-test. **Mais son ancre, si.** Ne rien insérer de nouveau dans la bande. L'ancre est la bande **elle-même**, telle qu'elle existe.

Le test de non-régression existant (`track.closest('[data-cell-date]') === cell`, sans stub d'`elementFromPoint`) doit rester vert **et** ne pas être affaibli.

---

## Acceptance Criteria

Les cinq premiers sont ceux d'`epics.md` (Story 36.7), **verbatim**. Les suivants sont ajoutés par cette story et portent leur motif.

**AC1 — Le tap ouvre un sélecteur ancré**
**Given** une bande portant une option de vote
**When** je la tape
**Then** un sélecteur s'ouvre, ancré sur cette bande
**And** il propose oui, peut-être, non

**AC2 — Ma réponse courante est marquée, et retirable**
**Given** j'ai déjà répondu
**When** le sélecteur s'ouvre
**Then** ma réponse courante y est marquée
**And** une entrée « Retirer ma réponse » est proposée

**AC3 — Un seul chemin de retrait dans le calendrier**
**Given** le retrait d'une réponse
**When** il est demandé
**Then** il passe par ce sélecteur
**And** aucun second chemin de retrait ne subsiste dans le calendrier
*Mise en œuvre : `<app-poll-response>` est retiré de `calendar-view.html`, et de lui seul (encadré n°2). ⚠️ Le panneau joueur perd donc aussi ses boutons de réponse — anticipation partielle et assumée de la 36.9.*

**AC4 — Fermer sans choisir ne change rien**
**Given** le sélecteur ouvert
**When** je le ferme sans choisir
**Then** ma réponse est inchangée

**AC5 — Rien à ouvrir là où rien n'est votable**
**Given** un vote clos ou une partie dont je ne suis pas membre
**When** la bande est touchée
**Then** aucun sélecteur ne s'ouvre

**AC6 — Une sélection ouverte garde le tap**
**Given** une sélection armée (la barre de sélection est affichée)
**When** je tape une bande portant une option de vote
**Then** le créneau est **basculé dans la sélection**
**And** aucun sélecteur ne s'ouvre
*Motif : encadré n°1. Sans cet AC, déclarer sur une plage contenant un créneau proposé deviendrait impossible, et le geste changerait de sens au milieu d'une sélection.*

**AC7 — Le clavier atteint le sélecteur**
**Given** un utilisateur au clavier et un créneau portant une option de vote
**When** il atteint la ligne de ce créneau dans le rail de détail
**Then** elle est **activable**, comme l'est déjà une ligne portant une séance
**And** l'activer ouvre le même sélecteur, avec le focus à l'intérieur
**And** `Échap` le ferme et **rend le focus** à la ligne
*Motif : encadré n°4 — les bandes ne sont pas focalisables par décision explicite ; sans cette ligne, la réponse à un vote serait inatteignable au clavier.*

**AC8 — Les deux contextes écrivent par la même route**
**Given** le calendrier d'une partie **et** le calendrier personnel
**When** je réponds ou retire depuis l'un ou l'autre
**Then** l'appel passe par `POST/DELETE /parties/:partieId/poll/:pollId/vote…` **existants**
**And** **aucun endpoint, aucun DTO, aucune migration** n'est ajouté

**AC9 — L'écran dit la vérité après l'écriture**
**Given** une réponse enregistrée ou retirée
**When** l'appel a réussi
**Then** la piste, le compteur et ma réponse se mettent à jour sur **toutes** les surfaces qui affichent ce créneau
**And** le sélecteur se ferme
*Motif : la dérivation est unique depuis la 36.6 — un seul rechargement doit suffire à mettre les quatre surfaces d'accord. Si une seule surface bouge, c'est qu'une dérivation a été dupliquée.*

**AC10 — Un échec n'invente jamais une réponse**
**Given** un vote clos entre l'affichage et mon geste (400), ou une partie que j'ai quittée (403)
**When** l'appel échoue
**Then** **aucune** réponse n'est affichée comme enregistrée
**And** l'échec est dit à l'utilisateur
**And** l'écran se remet à jour
*Motif : la couche de votes peut être périmée de plusieurs minutes en calendrier personnel — elle n'est pas câblée sur SSE.*

**AC11 — Une seule écriture à la fois**
**Given** une écriture en cours
**When** je tape à nouveau une entrée du sélecteur
**Then** aucune seconde requête concurrente n'est émise
*Motif : même garde que `pollActionPending` sur `choose`/`close`, et que `withdrawingOptionIds` dans `PollResponseComponent`.*

**AC12 — La couche éteinte n'ouvre rien**
**Given** la couche « votes-en-cours » éteinte
**When** je tape le créneau qui portait une option
**Then** aucun sélecteur ne s'ouvre
**And** le tap retrouve son sens de lecture
*Motif : depuis la 36.2/36.6, couche éteinte ⇒ le rang retombe, la piste disparaît. Un sélecteur qui s'ouvrirait encore rendrait actionnable ce que l'écran ne montre plus.*

**AC13 — Le sélecteur se dit en toutes lettres**
**Given** le sélecteur ouvert
**When** un lecteur d'écran l'annonce
**Then** il nomme **le jour et le créneau** concernés, les trois choix, et **lequel est le mien**
**And** aucune information n'y repose sur la seule couleur

**AC14 — La piste ne devient pas un bouton**
**Given** une cellule de Semaine ou une bande du Mois portant une piste
**When** le glissement de sélection la traverse
**Then** il continue de fonctionner à l'identique
**And** aucun nœud nouveau n'est inséré dans la cellule
*Motif : encadré n°8 — aucun test automatisé ne protège ce contrat.*

---

## Tasks / Subtasks

### 0. Réparer le dépôt, AVANT tout (encadré n°0)
- [x] `git status` : confirmer les cinq chemins non suivis de la 36.6.
- [x] ⚠️ **NON FAIT — délégué à l'utilisateur, et c'est une contrainte, pas un oubli.** L'override personnel `_bmad/custom/bmad-dev-story.user.toml` interdit explicitement `git add` / `git commit` à l'agent (« the user commits manually in their IDE »). **C'est très probablement la cause première du défaut** : aucun agent n'ajoute jamais un fichier neuf, et un IDE ne pré-coche pas les fichiers non suivis. Commande donnée à l'utilisateur au démarrage de cette story ; **les cinq chemins sont toujours en `??` à la fin de ce run** (cf. `git status` final).
- [x] Vérifier ensuite `git status` propre, puis **mesurer la baseline** : API suites/tests, web fichiers/tests, lint web, `eslint src/availability`, `pnpm typecheck`. *Repères de la 36.6 après revue : **API 60 suites / 1300 tests**, **web 105 fichiers / 1822 tests**, lint web **143**. **Reconfirmer, ne pas recopier.***

### 1. Le triplet d'identité (AC8, encadré n°3)
- [x] `poll-track.utils.ts` — ajouter `partieId: string` à `VoteParticipation`, **requis**, avec le commentaire disant pourquoi (les deux routes sont scopées à la partie ; le calendrier personnel agrège plusieurs parties).
- [x] `calendar-view.ts` — le renseigner aux **deux** points d'alimentation (contexte de partie : `pid` ; personnel : `p.partieId`).
- [x] Réparer les fixtures que le compilateur fera tomber (liste en encadré n°3). **Ne pas rendre le champ optionnel pour les éviter.**

### 2. Le composant de sélecteur (AC1, AC2, AC13, encadré n°7)
- [x] Nouveau `apps/web/src/app/features/calendar/vote-answer-picker/` — composant de **rendu pur** : `input` = `VoteParticipation` + libellé du jour/créneau + drapeau `busy` ; `output` = `answerChosen: VoteAnswer` et `withdrawRequested`. **Il n'injecte aucun service, n'appelle rien.** (Patron `PollTrack`, `SelectionBar`, `ConflictDialog`.)
- [x] Styles repris **au pixel** de `contrat-ui-calendrier.html:198-203` / `:626-636`.
- [x] Ordre **oui, peut-être, non** ; entrée courante marquée par un **fond** + un attribut ARIA, jamais par la seule couleur.
- [x] « Retirer ma réponse » rendue **seulement** si `myAnswer !== null`.
- [x] Les mots viennent d'`answerLabel()` — aucun second vocabulaire.
- [x] Spec dédiée, sans TestBed d'overlay : les trois entrées, le marquage, l'apparition conditionnelle du retrait, les noms accessibles, `busy` désactivant les entrées.

### 3. L'ouverture, point unique (AC1, AC5, AC6, AC12, encadrés n°1 et n°5)
- [x] `calendar-month-view.ts` / `calendar-week-view.ts` — dans `onCellClick()` **seulement**, appliquer l'ordre d'arbitrage de l'encadré n°1 et émettre un nouvel `output` (ex. `voteOptionActivated`) portant `{ vote: VoteParticipation, date, slot, anchor: HTMLElement }`. Les vues **ne décident pas** si l'on peut voter : elles signalent qu'une option a été touchée.
- [x] Le rang gagnant et la couche gouvernent : la vue n'émet que si elle rend déjà une piste sur ce créneau (`band.vote` / `eventVote(...)`), ce qui apporte AC12 et l'exclusion du rang `'seance'` **sans une ligne de condition nouvelle**.
- [x] `CalendarView` — `pickerTarget` / `pickerAnchor` en signaux, `openPicker()` / `closePicker()`, et le `<ng-template cdkConnectedOverlay>` du template (encadré n°5) avec positions de repli, backdrop, `overlayKeydown`.
- [x] **Focus** : entrant à l'ouverture, rendu à l'ancre à la fermeture.

### 4. Le clavier et les deux autres surfaces (AC7, encadré n°4)
- [x] `calendar-detail-rail` — la ligne de vote devient un `<button class="v v--action">`, comme la ligne de séance ; nouvel `output` `voteOptionActivated`. Nom accessible explicite (« Répondre au vote — vendredi 28 août, soir »). Le rail reste un **rendu pur**.
- [x] `calendar-agenda-view` — même traitement pour une entrée `votes-en-cours`.
- [x] `calendar-view.html` — câbler les deux `output` sur le même `openPicker()`. **Un seul chemin d'ouverture dans le TS.**

### 5. L'écriture (AC8, AC9, AC10, AC11, encadré n°6)
- [x] `CalendarView.onVoteAnswerChosen()` / `onVoteWithdrawn()` — `pollSvc.castVote(partieId, pollId, { optionId, answer })` / `pollSvc.withdrawVote(partieId, pollId, optionId)`. **`PollService` n'est pas modifié.**
- [x] Garde d'unicité : réutiliser `pollActionPending` (ou un signal frère nommé) — AC11.
- [x] Succès : fermer le sélecteur, `snack` avec la clé de ton existante, **puis** recharger — `loadScenarios(id)` en contexte de partie, `loadMeCalendarForRange(fromDateStr(), toDateStr())` en personnel.
- [x] Échec : message d'erreur, sélecteur fermé, **rechargement quand même** (l'état affiché est peut-être périmé — AC10).

### 6. Le retrait du second chemin (AC3, encadré n°2)
- [x] Retirer le bloc `<app-poll-response>` de `calendar-view.html` (panneau joueur) et l'import de `calendar-view.ts`.
- [x] **Ne toucher ni `seance-list` ni `scenario-read-dialog`** — le composant y reste.
- [x] `calendar-view.spec.ts:474-480` — le test « votes actifs affichés via app-poll-response » **change de sens** : il doit désormais vérifier l'**absence** du composant, et que les options sont lisibles dans la grille. Le réécrire sciemment, en commentant pourquoi.
- [x] Vérifier qu'`onPollResponded()` ne devient pas du code mort ; si plus aucun appelant, **le retirer**, sinon le laisser.

### 7. Tests — Web
- [x] **Overlay** : helper de test qui interroge `document.body` et **nettoie le conteneur** entre les tests (encadré n°5, piège 1). Une assertion négative faite dans `fixture.nativeElement` passerait pour une mauvaise raison — l'écrire une fois, correctement, et la réutiliser.
- [x] AC1 : tap sur une bande portant un vote ⇒ sélecteur ouvert, ancré (l'origine passée est bien l'élément touché).
- [x] AC2 : `myAnswer = 'YES'` ⇒ entrée marquée + « Retirer ma réponse » présente ; `myAnswer = null` ⇒ retrait **absent**.
- [x] **AC6 — le test qui compte** : sélection armée puis tap sur une bande de vote ⇒ **cellule basculée, aucun sélecteur**.
- [x] AC12 : couche `votes-en-cours` éteinte ⇒ aucun sélecteur (ni piste).
- [x] Rang `'seance'` gagnant sur le créneau ⇒ aucun sélecteur (cohérent avec l'absence de piste, 36.6 encadré n°8).
- [x] AC4 : fermeture par backdrop et par `Échap` ⇒ **aucun appel** à `castVote`/`withdrawVote`.
- [x] AC8 : contexte de partie ⇒ `castVote` appelé avec le `partieId` de la route ; **contexte personnel ⇒ appelé avec le `partieId` de l'ENTRÉE**, pas un autre. *(Deux parties différentes dans la même fixture : c'est le seul test qui prouve l'encadré n°3.)*
- [x] AC9 : après succès, `loadScenarios` / `getMyCalendar` rappelé, sélecteur fermé.
- [x] AC10 : `castVote` rejeté ⇒ message d'erreur, aucune réponse affichée comme posée.
- [x] AC11 : deux activations rapprochées ⇒ **une seule** requête.
- [x] AC7 : la ligne de vote du rail est un `button`, l'activer ouvre le sélecteur ; l'Agenda idem.
- [x] AC14 : le test de non-régression du glissement reste vert **sans** être modifié.
- [x] Étendre `makePollService()` (`calendar-view.spec.ts:69`) de `castVote`/`withdrawVote` — sans quoi les nouveaux chemins lèvent.
- [x] Zoneless : boucle de ticks établie (`for (let i=0;i<10;i++){ await Promise.resolve(); fixture.detectChanges(); }`), pas `whenStable()` seul. Attention aux blocs qui posent déjà `vi.useFakeTimers()` (sélection).

### 8. Vérification
- [x] Web : `pnpm test`, `pnpm lint` = baseline. API : **inchangée** — la relancer quand même pour le prouver (`pnpm test`, `pnpm typecheck`).
- [x] ✅ **VÉRIFICATION VISUELLE RÉELLE OBLIGATOIRE.** Les stories 36.4, 36.5, 36.13 et 36.6 ont **chacune** trouvé par ce seul moyen des défauts qu'aucun test n'a vus (la 36.6 en a trouvé **trois**). À regarder :
  - le sélecteur **ancré** sur la bande touchée, en Mois **et** en Semaine, y compris **en bas d'écran** (repli vers le haut) et **en case étroite** ;
  - **contexte de partie panneau ouvert** (fenêtre ~1424 px, grille ~380 px) — le cas qui a justifié la container query en 36.6 ;
  - répondre, puis **voir la piste bouger** sur les quatre surfaces ;
  - **retirer** une réponse et voir la portion tramée revenir ;
  - le **calendrier personnel**, sur un vote d'une partie où je ne suis **pas** MJ — c'est le seul endroit où le mauvais `partieId` se verrait ;
  - une **sélection armée** puis un tap sur une bande de vote : la case bascule, rien ne s'ouvre ;
  - le **clavier seul** : atteindre la ligne de rail, ouvrir, choisir, `Échap`, vérifier le retour du focus.
- [x] `/security-review` — **non optionnel sur cet épic** (`epics.md:335`), **en dette depuis la 36.4** et **explicitement dû depuis la 36.6** (note 18 de sa Dev Agent Record). Cette story **ouvre un chemin d'écriture depuis une surface nouvelle** : la lancer ici, ou dire pourquoi elle est encore reportée.
- [x] `deferred-work.md` — consigner : le commit incomplet de la 36.6 **refermé** (Task 0) ; l'écart SSE du calendrier personnel qui **devient un écran d'écriture** ; le sort d'`onPollResponded()` ; et, si la 36.9 doit reprendre quelque chose du panneau joueur retiré, l'écrire là plutôt que de compter sur la mémoire.
- [x] `git status` final : **aucun fichier de `apps/api` ni de `packages/shared`**. Et cette fois, **`git add` tout ce qui est neuf** avant de committer (encadré n°0 — c'est exactement l'erreur à ne pas répéter).

---

### Review Findings

Revue de code (bmad-code-review) du 2026-08-22 : 3 couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 5 patch, 3 défers, 6 rejetés comme bruit (dont 3 faux positifs vérifiés par lecture directe du code : `onCellClick(..., 'FULL_DAY')` sans `$event` est inoffensif car `bandsAreUniform()` exclut structurellement les rangs `'seance'`/`'vote'` — une bande FULL_DAY ne peut jamais porter de vote ; le type de `cdkConnectedOverlayOrigin` accepte bien un `Element` brut, confirmé par Context7 dans les Dev Notes de la story ; `pickerAnchor()!` est sûr, toujours renseigné au même point d'appel que `pickerVote()`).

- [x] [Review][Patch] Le focus n'entre jamais dans le sélecteur à l'ouverture (viole AC7 et le piège n°2 de l'encadré n°5) — `calendar-view.ts` (`onVoteOptionActivated`, `closePicker`), `vote-answer-picker.html` : aucun `cdkTrapFocus` ni `focus()` sur la première entrée. Conséquence directe : `Échap` remonte au clavier de la grille (annule la sélection) au lieu de fermer le sélecteur, puisque le focus n'y est jamais entré.
- [x] [Review][Patch] L'ancre du sélecteur devient obsolète/détachée sans fermeture du picker [calendar-view.ts:889-918] — `onViewChange`, `onMonthDateChange`, `onWeekDateChange` et l'effet SSE (`:585-591`) n'appellent jamais `closePicker()` : un changement de vue/mois/semaine, ou une écriture SSE d'un tiers pendant que le sélecteur est ouvert, laisse `pickerAnchor()` référencer un nœud DOM détaché et affiche des options de vote périmées.
- [x] [Review][Patch] Le `aria-label` du bouton enveloppant masque le nom accessible riche d'`app-poll-track` [calendar-detail-rail.html:67-78, calendar-agenda-view.html:29-36] — et aucun `aria-haspopup`/`aria-expanded` sur les quatre déclencheurs du sélecteur (Mois, Semaine, rail, Agenda), alors que le reste du composant est très soigné côté ARIA.
- [x] [Review][Patch] `closePicker()` est appelé avant l'attente de l'écriture [calendar-view.ts:1030-1032 dans `writeVote()`] — rend le `[busy]="pollActionPending()"` câblé sur `<app-vote-answer-picker>` (`calendar-view.html:280`) fonctionnellement mort (le composant a déjà disparu quand `busy` devient vrai) et masque l'échec au point d'interaction où l'utilisateur l'attend.
- [x] [Review][Patch] Message d'erreur du vote codé en dur au lieu d'une clé de thème [calendar-view.ts:994] — `onVoteAnswerChosen()` passe `'Impossible d'enregistrer ta réponse. Réessayez.'` en dur, alors qu'`onVoteWithdrawn()` (:1006) utilise correctement `theme.tone()['poll.withdraw_error']` pour une opération miroir. Déroge à l'instruction explicite de l'encadré n°7 : « si une clé manque, la poser dans les trois thèmes ».
- [x] [Review][Defer] Rien n'empêche d'armer une nouvelle sélection ailleurs sur la grille pendant que le sélecteur de vote est ouvert [calendar-month-view.ts, calendar-week-view.ts] — deux UI flottantes indépendantes (barre de sélection + sélecteur de vote) peuvent alors coexister sans coordination. Requiert une décision d'architecture (les vues ignorent volontairement l'état du picker par conception) ; aucun AC de cette story ne le couvre — deferred, pre-existing scope gap
- [x] [Review][Defer] `countParticipants()` n'a aucune gestion d'erreur [apps/api/src/parties/participant-count.util.ts:83-90] — deferred, pre-existing (livré par la 36.6, non touché par cette story)
- [x] [Review][Defer] Arrondi indépendant des trois segments de la piste peut cumulativement dépasser 100 % [poll-track.utils.ts `trackSegments()`, poll-track.ts `pct()`] — deferred, pre-existing (livré par la 36.6, non touché par cette story)

---

## Hors périmètre

- **Le mode Destinée, et la réduction du panneau à « qui manque »** → **36.9**. Cette story retire la moitié *joueur* du panneau (AC3 l'impose) ; elle ne construit **rien** à la place.
- **Composer / modifier les options d'un vote depuis la grille** (et le retrait du sélecteur « Planifier un vote pour : ») → **36.10, D-16**.
- **Sceller un créneau**, l'Agenda du MJ → **36.12**. Le panneau MJ (`app-poll-status`) n'est pas touché.
- **La refonte de l'Agenda** → 36.11. On y ajoute une activation, pas une refonte.
- **Ouvrir le scénario d'une séance depuis une bande de grille** (table 1 d'`EXPERIENCE.md`) — non implémenté à ce jour, seul le rail le fait (36.1). **Ne pas l'ajouter au passage** : c'est une seconde réassignation du tap, elle mérite sa propre story.
- **Aligner `getMissingVoters()` / `poll-status` sur l'effectif MJ inclus** → dette écrite (`deferred-work.md:15`).
- **Câbler `GET /me/calendar` sur SSE** → dette écrite (`deferred-work.md:39`), non soldée ici.
- **Retirer `.seance-dot`**, aligner « Soirée » / « Soir » → dettes de la 36.13.

---

## Ce qui doit continuer de fonctionner

- **La sélection par glissement**, en Mois comme en Semaine : long-press 450 ms, seuil 8 px, `elementFromPoint` + `closest('[data-cell-date]')`, clamp, `suppressNextClick`, `Échap`, `Maj`+flèches, la barre et l'écriture groupée avec sa résolution de conflits (36.3, 36.4).
- **L'appui maintenu sur une bande à objet arme la sélection** (collision 6) — inchangé.
- **La piste de participation** et ses quatre surfaces, la densité par `@container` seule, `pointer-events: none`, `data-winner` (36.6).
- **`buildDayDetail` / `SLOT_PRECEDENCE` / `composeSeanceInfo` / `entryCoversSlot`** — étendus, jamais dupliqués.
- **FR-50** : une séance confirmée rend le créneau indisponible quelle que soit la couche.
- **Le rail permanent** à toutes les largeurs, et l'ouverture du scénario depuis une ligne de séance (36.1).
- **Le contrat DOM** : `.slot-cell`, `data-cell-date`, `data-cell-slot`, `.band`, `data-winner`, `.week-grid`, `app-selection-bar`.
- **`PollResponseComponent` dans la fiche de scénario** (`seance-list`, `scenario-read-dialog`) — non touché.
- **`GET /me/calendar`** : les 5 couches, aucune clé ajoutée ni retirée. **Aucun fichier de `apps/api` ni de `packages/shared` n'est modifié par cette story.**

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Ouvrir le sélecteur pendant une sélection armée.** Déclarer sur une plage contenant un créneau proposé deviendrait impossible (AC6, encadré n°1).
2. **Poser un second point d'entrée du tap** au lieu de passer par `onCellClick()`. La vue Semaine n'a **aucun** `(click)` : un handler ajouté au template y créerait un chemin parallèle que le geste ne connaît pas.
3. **Oublier `suppressNextClick`.** Un appui maintenu se terminant sur une bande de vote ouvrirait le sélecteur en plus d'armer la sélection.
4. **Oublier `partieId`**, ou le prendre de la route en calendrier personnel : on voterait dans la mauvaise partie — et le serveur répondrait `403`/`400` sans que l'écran sache pourquoi (encadré n°3).
5. **Rendre `partieId` optionnel** « pour ne pas casser les fixtures » : un `undefined` finirait dans une URL.
6. **Chercher le sélecteur dans `fixture.nativeElement`** : il est dans le conteneur d'overlay, sur `document.body`. Une assertion négative y passerait toujours, pour rien.
7. **Ne pas nettoyer le conteneur d'overlay** entre les tests : les sélecteurs s'accumulent et les assertions de comptage deviennent fausses par intermittence.
8. **Recopier `VOTE_OPTIONS` de `PollResponseComponent`** : son ordre est `YES, NO, MAYBE`, le contrat dit **oui, peut-être, non**.
9. **Écrire un second vocabulaire de réponse** au lieu d'`answerLabel()`.
10. **Proposer « Retirer ma réponse » alors que je n'ai pas répondu** — le défaut que `PollResponseComponent` a corrigé en revue.
11. **Recopier la mise à jour optimiste de `PollResponseComponent`** au lieu de recharger. Deux chemins de vérité, dont un qui reconstruit un DTO à la main (encadré n°6).
12. **Oublier le rechargement en calendrier personnel** : aucun SSE n'y arrivera, la piste resterait figée jusqu'au changement de plage.
13. **Laisser une réponse s'afficher après un échec** (AC10) : un vote clos entre l'affichage et le tap est un cas réel, pas théorique.
14. **Laisser `Échap` du sélecteur remonter à la grille** — il y annulerait la sélection en cours.
15. **Ne pas rendre le focus à l'ancre** à la fermeture : l'utilisateur clavier retombe en haut du document.
16. **Insérer un nœud dans la bande pour servir d'ancre.** L'ancre est la bande. Un nœud de plus, sans `pointer-events: none`, casse le glissement — **et les tests restent verts** (encadré n°8).
17. **Conditionner le sélecteur à `!isMjMode()`** : le MJ vote (encadré n°2), et il vient de perdre son seul autre chemin.
18. **Toucher `apps/api` ou `packages/shared`.** Cette story est front pur ; tout fichier serveur au `git status` final est un signal d'alarme.
19. **Faire une deuxième requête sur double activation** (AC11).
20. **Oublier l'encadré n°0** et travailler sur un arbre dont cinq fichiers manquent au dépôt.

### Décisions arrêtées par cette story

- **Un seul sélecteur, dans `CalendarView`**, pour les quatre surfaces — jamais un par vue. Même raison que le composant de piste unique de la 36.6.
- **`partieId` entre dans `VoteParticipation`**, requis (type front seulement).
- ⚠️ **`<app-poll-response>` est retiré du calendrier**, et de lui seul. Anticipation partielle et assumée de la 36.9 — l'AC3 l'exige littéralement.
- **Le sélecteur s'ouvre pour tout membre viewable, MJ compris.**
- **L'ordre d'arbitrage du tap** est celui de l'encadré n°1 : sélection ouverte > sélecteur > lecture. Le rail suit dans tous les cas.
- **Le rail porte le chemin clavier** — sa ligne de vote devient un bouton, comme la ligne de séance.
- **Après écriture : rechargement**, jamais une reconstruction locale du DTO.

### Décisions laissées à l'implémentation

- **`cdkConnectedOverlay` ou `MatMenu`** (encadré n°5). *Recommandation : l'overlay CDK, pour l'ancrage direct sur un `Element` sans déclencheur fantôme. **Commenter le choix**, c'est le premier du projet.*
- **Nom de l'`output` des vues** — `voteOptionActivated` proposé. *Nommer d'après ce qui est arrivé, pas d'après ce que ça déclenche : les vues ne savent pas qu'un sélecteur existe.*
- **`pollActionPending` réutilisé, ou un signal frère** ? *Recommandation : le réutiliser — c'est déjà « une action de vote est en vol », et il désactive au passage les boutons du panneau MJ, ce qui est correct.*
- **`onPollResponded()` survit-il au retrait de `<app-poll-response>` ?** *Le vérifier : s'il n'a plus d'appelant, le retirer plutôt que de le laisser en dette.*
- **Où vit l'en-tête « Ven 28 août — soir »** : composé par `CalendarView` et passé au sélecteur, ou composé par le sélecteur à partir de la date et du créneau ? *Recommandation : composé par `CalendarView` — les formateurs de date y sont déjà (`CALENDAR_CELL_DATE_FORMAT`, `SLOT_LABELS`), le sélecteur reste un rendu pur.*

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material + CDK 22.0.2, Vitest 4, TypeScript 6.0.2. `@if`/`@for`, signals, `input()`/`output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **CDK Overlay** : `@angular/cdk` est déjà une dépendance directe (`apps/web/package.json:16`). **Aucune dépendance nouvelle à installer.**
- **Aucune migration Prisma. Aucun changement serveur. Aucun changement de `packages/shared`.**
- **Exécution : tout par Docker.** `docker compose exec web pnpm <…>`.
- **Context7 (MCP)** : consulté pour cette story sur l'API `CdkConnectedOverlay` (entrées/sorties, types acceptés par `cdkConnectedOverlayOrigin`) — **y retourner** avant d'écrire le positionnement et le piège à focus, ce sont les points qui bougent le plus d'une version à l'autre.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau requis ; un écart connu est aggravé en visibilité, pas en nature.**

- **Contexte de partie** : `castVote()` et `withdrawVote()` émettent déjà sur `partieTopic(partieId)` (`poll.service.ts:118`, `:154`) et `CalendarView` recharge sur `scenariosSvc.changed()` (`:487-497`). La réponse d'un **autre** membre fait donc bouger la piste sans rechargement — comportement hérité de la 36.6, **à revérifier à l'œil** maintenant qu'un second écran écrit.
- **Calendrier personnel** : `GET /me/calendar` n'est **toujours pas** câblé sur `RealtimeService` (`deferred-work.md:39`). Jusqu'ici cet écran ne faisait que **lire** une donnée périmée ; il **écrit** désormais dessus. Le risque concret est l'AC10 : voter sur un vote clos depuis plusieurs minutes. Traité par le rechargement systématique et le message d'échec — **l'écart n'est ni soldé ni aggravé sur le fond, mais il devient visible**. Le redire dans `deferred-work.md`. [Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

- 🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`), en dette depuis la 36.4 et **explicitement dû** depuis la 36.6.
- **Autorisation** : entièrement serveur, inchangée. `castVote`/`withdrawVote` passent par `getViewable(partieId, userId)` puis vérifient `poll.partieId === partieId` et `poll.status === 'OPEN'` (`poll.service.ts:100-107`, `:139-153`). **L'UI ne fait que refléter cette garde — elle ne la remplace pas** : un sélecteur ouvert à tort ne peut pas produire une écriture illégitime, il produit un `400`.
- **Isolation entre membres** : `userId` vient **exclusivement** de `@CurrentUser()`, jamais de l'URL ni du corps. Le retrait est un `deleteMany` sur `{ optionId, userId }` — structurellement incapable de toucher la réponse d'autrui. **Ne rien ajouter au corps de la requête.**
- **`partieId` dans l'URL** : c'est le point où une erreur de cette story deviendrait un défaut de sécurité **apparent** (voter dans la partie d'à côté). Le serveur le rejette (`403`/`400`), mais le test AC8 à deux parties est ce qui l'attrape avant.
- **XSS** : libellés rendus par interpolation. **Jamais `[innerHTML]`**, y compris pour le nom du créneau dans l'en-tête du sélecteur.
- **Aucune donnée nouvelle n'est exposée** : le sélecteur n'affiche que `myAnswer`, déjà servi.

### Dette refermée par cette story

- **FR-35 n'avait qu'un chemin de retrait, et il était hors du calendrier** — le contrat en fait « le chemin unique » (`contrat-ui-calendrier.html:634`).
- **Le trou clavier de la couche de votes** : jusqu'ici, aucun chemin clavier vers une réponse depuis le calendrier (AC7).
- **Le commit incomplet de la 36.6** (encadré n°0, Task 0).

### Dette explicitement NON refermée

- `deferred-work.md:15` — `getMissingVoters()` / `poll-status` sans le MJ.
- `deferred-work.md:17`, `:24` — liste Agenda non bornée, aggravée par l'éclatement par option ; **cette story y ajoute un bouton par ligne**, sans en changer le nombre.
- `deferred-work.md:29` — un vote masqué par une séance sur le même créneau reste invisible au rail : **il n'a donc pas de sélecteur**. Cohérent avec l'absence de piste (36.6, encadré n°8), **ne pas corriger ici**.
- `deferred-work.md:39` — `GET /me/calendar` non câblé sur SSE.
- Les dettes de la 36.13 (`.seance-dot`, « Soirée » / « Soir »).

### Project Structure Notes

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/vote-answer-picker/` — `.ts` / `.html` / `.scss` / `.spec.ts`

**Modifiés — Web**
- `calendar/poll-track.utils.ts` (+ `.spec.ts`) — `VoteParticipation.partieId`
- `calendar-view/calendar-view.ts` / `.html` / `.spec.ts` — alimentation de `partieId`, overlay, ouverture, écriture, **retrait de `<app-poll-response>`**
- `calendar-month-view/` (`.ts` / `.spec.ts`) — `onCellClick` + `output`
- `calendar-week-view/` (`.ts` / `.spec.ts`) — idem
- `calendar-detail-rail/` (`.ts` / `.html` / `.scss` / `.spec.ts`) — ligne de vote activable
- `calendar-agenda-view/` (`.ts` / `.html` / `.scss` / `.spec.ts`) — ligne de vote activable
- fixtures web portant un `VoteParticipation` (cf. encadré n°3)

**Non touchés — à confirmer par `git status` final**
- `apps/api/**` · `packages/shared/**` · `apps/api/prisma/**` · `core/poll/poll.service.ts` · `features/poll/poll-response/**` · `features/poll/poll-status/**` · `features/scenarios/seance-list/**` · `selection.utils.ts` · `selection-bar/**` · `conflict-dialog/**` · `constraint-panel/**` · `poll-track/poll-track.ts`

### References

- [Source: **epics.md — Story 36.7**] — les cinq AC, verbatim ; `epics.md:1923` — portée **Front** ; `epics.md:1906` — « FR-51 | 36.6, 36.7 » ; `epics.md:335` — **`/security-review` non optionnel sur l'épic** ; `epics.md:1934` — convention de lecture du contrat d'UI (le ⚠️ signale un écart à la cible finale).
- [Source: **EXPERIENCE.md §6 bis, table 1**] — « Tap sur une bande portant une **option de vote** → ouvre le sélecteur de réponse », « Idem » en Semaine et en Agenda ; **table 2** — « Répondre à un vote : tap → sélecteur oui/peut-être/non ; **condition : vote ouvert, membre de la partie** » et « Retirer sa réponse : **même sélecteur**, quatrième entrée ».
- [Source: **EXPERIENCE.md §6 bis — collision 4**] — l'arbitrage : *« un tap est binaire, une réponse de vote ne l'est pas — le cycle n'annonce pas son ordre, et “tap = oui” rendrait le non plus coûteux que le oui, ce qui biaiserait les réponses »*. **Collision 5** — seul le mode composition réassigne le tap. **Collision 6** — l'appui maintenu arme, toujours.
- [Source: **EXPERIENCE.md §6 bis — clavier**] — « `Tab` atteint la case, **jamais la bande**, qui produirait 126 arrêts » : le motif de l'AC7.
- [Source: **contrat-ui-calendrier.html:198-203, :626-636**] — le `.picker` au pixel, son contenu, et *« Ancré sur la bande touchée. La quatrième entrée est le chemin unique de FR-35. »* ; `:413` — ce qui disparaît du panneau ; `:726` — « Sélecteur de réponse de vote — **neuf** ».
- [Source: **prd.md:286 — FR-35**] — « un joueur peut revenir sur sa réponse et la retirer » ; **prd.md:326-333 — FR-51** ; **prd.md:340 — FR-52** (le mode Destinée, hors périmètre).
- [Source: `36-6-la-piste-de-participation-dun-vote.md`] — `VoteParticipation`, la piste, le point unique de dérivation, l'effectif MJ compris, `pointer-events: none`, et **« ne poser aucun gestionnaire de clic sur la piste — c'est la 36.7 »**.
- [Source: `36-3-la-selection-devient-le-geste-de-declaration.md` + epics.md Story 36.3] — AC1 « une bande **sans objet posé** », AC15/AC17/AC18, `suppressNextClick`, `Entrée` réservée à la validation.
- [Source: `36-1-le-rail-de-detail.md`] — le rail permanent, rendu pur, la ligne activable et sa règle de nom accessible (AC11/AC13).
- [Source: `36-13-la-grille-semaine-a-densite-variable.md`] — le contrat DOM du glissement que rien ne teste.
- [Source: `poll.controller.ts:49, :63` ; `poll.service.ts:94-160`] — les deux routes, leurs gardes, et l'émission SSE.
- [Source: `deferred-work.md:15, :17, :24, :29, :39`] — les dettes croisées.
- [Source: Context7 — `@angular/cdk` overlay] — `CdkConnectedOverlay` : entrées (`cdkConnectedOverlayOrigin` accepte `CdkOverlayOrigin | FlexibleConnectedPositionStrategyOrigin`, donc un `ElementRef`/`Element`), sorties `backdropClick` / `detach` / `overlayKeydown` / `overlayOutsideClick`.
- [Source: docs/checklist.md ; CLAUDE.md] — évaluation SSE obligatoire, `/security-review` et `/code-review`, tout par Docker, Context7 avant du code framework.

---

## Questions pour l'utilisateur

1. ⚠️ **Le retrait de `<app-poll-response>` du calendrier** (encadré n°2) est ce que l'AC3 impose littéralement, mais il fait disparaître **aussi** les boutons de réponse du panneau joueur — un morceau de ce que la 36.9 devait retirer. Confirmes-tu ce périmètre, ou préfères-tu ne retirer **que** le bouton « Retirer » du composant tant qu'il est rendu dans le calendrier (option plus petite, mais qui laisse deux chemins de *réponse* coexister) ?
2. **Le sélecteur pour le MJ** : je l'ouvre pour tout membre viewable, MJ compris (il vote réellement, c'est le motif de l'effectif de la 36.6, et il n'aurait plus aucun autre chemin après le retrait ci-dessus). À confirmer.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story, 2026-08-21)

### Debug Log References

- **Baseline mesurée avant tout changement** (`HEAD = fca3ffd`) : **web 105 fichiers / 1822 tests**, **lint web 143**, **API 60 suites / 1300 tests**, `typecheck` API propre. **Les quatre chiffres correspondent exactement** aux repères annoncés par la story — contrairement à la 36.6, aucun écart de baseline.
  ⚠️ **L'arbre n'était pas propre** et ne l'est toujours pas : les cinq fichiers de la 36.6 restent non suivis (encadré n°0, Task 0). Aucun `git stash` n'a donc été employé pour comparer le lint — la comparaison s'est faite sur le compteur global (143 → 172 → 143) et par `npx eslint` ciblé sur `src/app/features/calendar/**`, qui isole les erreurs de MES fichiers des 143 pré-existantes.
- **Phase rouge respectée à chaque tâche** : `partieId` (3 erreurs de compilation), sélecteur (module introuvable), grilles (10 tests en échec), rail + Agenda (5 en échec), `CalendarView` (11 en échec).
- **Phase verte finale** : **web 106 fichiers / 1859 tests** (+1 fichier, +37 tests), lint web **143 = baseline**, **API 60 / 1300 = baseline** et `typecheck` propre (aucun fichier serveur touché — confirmé par `git status`).
- **Deux tests d'abord écrits faux, corrigés en comprenant pourquoi** : (1) l'AC3 s'appuyait sur `ACTIVE_POLL_SCENARIO`, dont le vote **n'a aucune option** — il ne pouvait donc produire aucune entrée de calendrier ; remplacé par `TWO_OPTION_POLL_SCENARIO`. (2) l'AC10 attendait `myAnswer: 'YES'` sans utilisateur courant dans la fabrique — or `myAnswer` s'en dérive, l'assertion portait sur rien.

### Completion Notes List

1. **Les deux arbitrages ouverts par la story ont été tranchés par l'utilisateur au démarrage** : `<app-poll-response>` est **retiré du calendrier** (option complète, pas seulement le bouton « Retirer »), et le sélecteur **s'ouvre pour tout membre viewable, MJ compris**. L'implémentation suit ces deux réponses.

2. 🚨 **Task 0 n'a pas pu être faite, et le dépôt est TOUJOURS cassé.** L'override `bmad-dev-story.user.toml` interdit `git add`/`git commit` à l'agent. **La contrainte est très probablement la cause du défaut d'origine** : un agent qui ne peut pas ajouter ne le fait jamais, et l'IDE ne pré-coche pas les fichiers non suivis. Les cinq chemins de la 36.6 — plus le `vote-answer-picker/` de cette story — sont en `??` à la fin de ce run. **À faire manuellement avant de committer.**

3. **`partieId` requis sur `VoteParticipation` a fait le travail annoncé** : 8 fichiers de fixtures sont tombés à la compilation, exactement comme `membersCount` en 36.6. Le test qui compte est celui de l'AC8 en **calendrier personnel** : il vote sur une entrée dont le `partieId` (`partie-9`) diffère de tout ce que la route pourrait fournir.

4. **Point d'entrée unique tenu.** L'ouverture passe par `onCellClick()` dans les deux grilles, et par nulle part ailleurs. En vue Semaine, l'ancre a demandé un champ de plus sur `PointerDownInfo` : le tap y est **synthétisé au `pointerup` sur la grille**, l'élément touché serait perdu sans être retenu au `pointerdown`.

5. **La condition d'ouverture n'est PAS une règle nouvelle** : les vues n'émettent que là où elles rendent déjà une piste (`band.vote` / `eventVote()`). L'AC12 (couche éteinte) et l'exclusion du rang « séance » tombent donc **sans une seule ligne de condition supplémentaire** — et sans risque de diverger de la préséance.

6. **AC6 verrouillé par le test le plus important de la story** : sélection armée puis tap sur une bande de vote ⇒ la case bascule, aucun sélecteur. Vérifié aussi **à l'écran** (17-18 septembre sélectionnés, tap sur le 20 : il rejoint la sélection).

7. 🚨 **DÉFAUT RÉEL n°1, trouvé À L'ŒIL et par aucun des 1859 tests : le sélecteur était TRANSPARENT.** La planche contractuelle écrit `background: var(--sys-container)` — **ce jeton n'existe pas dans `styles.scss`** ; il appartient à la maquette. Une variable CSS non résolue ne casse rien : le fond était simplement absent, et les bandes du calendrier traversaient le panneau, illisible. **Corrigé** en passant aux jetons du projet (`--mat-sys-surface-container-high`, `--mat-sys-outline-variant`) et en exprimant le marquage de ma réponse par `color-mix(… var(--color-available) 16%)` plutôt que par le `rgba(126,200,164,.16)` de la planche — qui est ce vert **du seul thème émeraude**. Le sélecteur est désormais juste dans les trois thèmes, ce que la couleur en dur ne permettait pas.

8. ⚠️ **DÉFAUT RÉEL n°2, trouvé à l'œil : la ligne de vote de l'Agenda gardait le fond gris par défaut du navigateur**, posant un rectangle autour de la piste. Le rail y échappait (sa classe `.v--action` existait déjà). **Corrigé** dans `calendar-agenda-view.scss`.

9. **Une fausse alerte, et elle mérite d'être écrite** : la première ouverture de l'app affichait `TS2339: Property 'PICKER_POSITIONS' does not exist` — un **overlay d'erreur périmé** du dev server, resté à l'écran depuis un état intermédiaire du fichier. La propriété était bien là. Recharger avant de conclure.

10. **`onPollResponded()` a été RETIRÉ**, avec son test. Il n'existait que pour l'`(responded)` de `<app-poll-response>` : après le retrait exigé par l'AC3, il n'avait plus aucun appelant. Ce qu'il faisait (fraîcheur après une réponse) est repris par le rechargement explicite de `writeVote()`, qui couvre **les deux** contextes au lieu d'un seul.

11. **Un seul corps d'écriture** (`writeVote`) porte la garde d'unicité, le message, le rechargement et l'échec. Il **recharge aussi quand l'appel échoue** : l'écran affichait peut-être un vote clos depuis plusieurs minutes, le calendrier personnel n'ayant aucun temps réel.

12. ✅ **VÉRIFICATION VISUELLE RÉELLE FAITE** (Chrome, session ouverte par l'utilisateur), sur **les deux contextes** et **les quatre surfaces** :
    - **Calendrier personnel** — sélecteur ancré sur la bande, replié **vers le haut** quand l'ancre est basse (les positions de repli fonctionnent) ; répondre « oui » fait passer la piste de **1 / 5 à 2 / 5** avec son segment vert et fait apparaître « tu as dit oui » ; retirer la ramène à **1 / 5**. Les deux messages de ton s'affichent (« L'écureuil a transmis / effacé ta réponse »).
    - **Contexte de partie, panneau ouvert (grille ~380 px)** — le sélecteur s'ouvre sur une bande de case ÉTROITE, sans titre visible ; « peut-être » donne « 2 / 5 tu as dit peut-être » au rail ; retiré ensuite.
    - **Vue Semaine** et **Agenda** — même sélecteur, même entête, ancré sur la cellule / le bouton de ligne.
    - **AC3 confirmé à l'écran** : le panneau joueur du calendrier de partie ne contient plus aucun bouton de réponse ni de retrait.
    - **AC4** : `Échap` ferme sans rien écrire ; **AC6** : sélection armée, la case bascule et rien ne s'ouvre.

13. **Base de développement laissée telle quelle** : les deux votes posés pendant la vérification (un « oui » au calendrier personnel, un « peut-être » en contexte de partie) ont été **retirés par le sélecteur lui-même** — ce qui a servi de test au chemin de retrait. Les pistes sont revenues à 1 / 5 dans les deux cas. Aucune ligne SQL posée à la main, contrairement à la 36.6.

14. ❌ **`/security-review` reste DÛ** sur cet épic (dette depuis la 36.4, explicitement due depuis la 36.6). Cette story n'ajoute **aucune surface serveur** — aucun endpoint, aucun DTO, aucune requête — mais elle **ouvre un chemin d'écriture depuis un écran qui n'en avait pas**. À lancer avant de clore l'épic.

### File List

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/vote-answer-picker/vote-answer-picker.ts` / `.html` / `.scss` / `.spec.ts` (10 tests)

**Modifiés — Web**
- `calendar/poll-track.utils.ts` / `.spec.ts` (`VoteParticipation.partieId` requis, `VoteOptionActivatedEvent`)
- `calendar/day-detail.utils.ts` / `.spec.ts` (`dateKeyToLocalMidnight`)
- `calendar-view/calendar-view.ts` / `.html` / `.spec.ts` (alimentation de `partieId`, overlay CDK, `onVoteOptionActivated` / `closePicker` / `onPickerKeydown` / `onVoteAnswerChosen` / `onVoteWithdrawn` / `writeVote`, **retrait de `<app-poll-response>` et de `onPollResponded()`**)
- `calendar-month-view/calendar-month-view.ts` / `.html` / `.spec.ts` (`voteOptionActivated`, `voteAt()`, ordre d'arbitrage du tap)
- `calendar-week-view/calendar-week-view.ts` / `.spec.ts` (idem + ancre retenue sur `PointerDownInfo`)
- `calendar-detail-rail/calendar-detail-rail.ts` / `.html` / `.spec.ts` (ligne de vote activable — chemin clavier)
- `calendar-agenda-view/calendar-agenda-view.ts` / `.html` / `.scss` / `.spec.ts` (ligne de vote activable)

**Non touchés (confirmé par `git status`)**
- `apps/api/**` · `packages/shared/**` · `apps/api/prisma/**` · `core/poll/poll.service.ts` · `features/poll/poll-response/**` · `features/poll/poll-status/**` · `features/scenarios/**` · `selection.utils.ts` · `selection-bar/**` · `conflict-dialog/**` · `constraint-panel/**` · `poll-track/poll-track.ts`

### Change Log

- 2026-08-21 — **Implémentation complète (Tasks 1 à 8, bmad-dev-story). Statut → review.** Front pur, conforme à l'annonce : **aucun fichier de `apps/api` ni de `packages/shared` n'a été touché** (confirmé par `git status`), aucun endpoint, aucun DTO, aucune migration — les routes de vote et de retrait existaient depuis les stories 8.8 et 30.1. Les deux arbitrages ouverts par la story ont été **tranchés par l'utilisateur** au démarrage : `<app-poll-response>` retiré du calendrier (et de lui seul), sélecteur ouvert à **tout membre viewable, MJ compris**. `partieId` requis sur `VoteParticipation` a fait tomber 8 fichiers de fixtures, comme prévu — et le test d'AC8 en calendrier personnel est celui qui prouve qu'on vote dans la bonne partie. L'ouverture passe par le **point d'entrée unique** `onCellClick()` dans les deux grilles ; la vue Semaine a demandé de retenir l'ancre au `pointerdown`, son tap étant synthétisé au `pointerup`. La condition d'ouverture réutilise celle qui fait rendre la piste, si bien que l'AC12 et l'exclusion du rang « séance » tombent sans règle nouvelle. `onPollResponded()` a été **retiré** avec son test : plus aucun appelant après l'AC3. 🚨 **DEUX DÉFAUTS RÉELS TROUVÉS À L'ŒIL, aucun vu par les 1859 tests.** (1) **Le sélecteur était TRANSPARENT** : la planche contractuelle écrit `var(--sys-container)`, un jeton de maquette **qui n'existe pas** dans `styles.scss` — une variable non résolue ne casse rien, le fond était juste absent et les bandes traversaient le panneau. Corrigé en passant aux jetons du projet, et en exprimant le marquage de ma réponse par `color-mix()` plutôt que par le vert en dur du seul thème émeraude : le sélecteur est désormais juste dans les trois thèmes. (2) **La ligne de vote de l'Agenda gardait le fond gris par défaut du navigateur.** ✅ **Vérification visuelle réelle faite sur les deux contextes et les quatre surfaces** : la piste passe de 1/5 à 2/5 en répondant et revient à 1/5 au retrait, le repli vers le haut fonctionne, le sélecteur s'ouvre sur une case étroite en contexte de partie panneau ouvert, `Échap` ne change rien, et une **sélection armée garde le tap** (AC6). Les deux votes de test ont été retirés par le sélecteur lui-même — la base est laissée telle quelle. **Web 106 fichiers / 1859 tests** (baseline 105/1822), lint web **143 = baseline**, **API 60/1300 = baseline**, `typecheck` propre. ⚠️ **Task 0 N'A PAS PU ÊTRE FAITE** : l'override `bmad-dev-story.user.toml` interdit `git add`/`git commit` à l'agent — ce qui est très probablement la cause première du commit incomplet de la 36.6. Les cinq fichiers de la 36.6 **et** le `vote-answer-picker/` de cette story sont à ajouter à la main. ❌ **`/security-review` reste dû sur l'épic.**

- 2026-08-21 — Story créée (bmad-create-story). Trois découvertes structurelles portées en tête. 🚨 **(1) Le dépôt est cassé** : les cinq fichiers créés par la story 36.6 (`participant-count.util.*`, `poll-track.utils.*`, `poll-track/`) ne sont **pas suivis par git** — le commit `fca3ffd` est incomplet et un clone frais ne compile pas ; Task 0 le répare avant tout, et interdit le `git stash` de comparaison de lint tant que ce n'est pas fait. **(2) L'ordre d'arbitrage du tap** est le vrai sujet : les deux grilles convergent sur `onCellClick()` (seul point d'entrée ; la vue Semaine n'a aucun `(click)`), et une **sélection armée doit garder le tap** — sans quoi déclarer sur une plage contenant un créneau proposé deviendrait impossible (AC6 ajouté). Ce n'est **pas** une divergence de la 36.3, dont l'AC1 excluait déjà la bande « à objet posé », ni du contrat : `EXPERIENCE.md` §6 bis, collision 4, arbitre le sélecteur depuis le 2026-08-17. **(3) Il manque `partieId`** pour agir : `VoteParticipation` porte `pollId`/`optionId` mais pas la partie, et le calendrier personnel en agrège plusieurs — champ ajouté, **requis**, avec le test à deux parties qui l'attrape. Deux points de plus, non écrits ailleurs : les bandes **ne sont pas focalisables** par décision explicite, donc le **rail porte le chemin clavier** (AC7) ; et `<app-poll-response>`, rendu **dans** le calendrier, est le « second chemin de retrait » que l'AC3 interdit — son retrait du seul calendrier est la mise en œuvre retenue, ⚠️ anticipation partielle de la 36.9, soumise à confirmation. Aucun changement serveur, aucun DTO partagé, aucune migration.
