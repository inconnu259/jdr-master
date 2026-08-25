---
baseline_commit: e986913a1d2ac90656c73e188b381cb8f5b6564e
---

# Story 29.0: Palettes de statut des trois thèmes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que les états se distinguent les uns des autres dans le thème que j'ai choisi,
so that la couleur me dise quelque chose au lieu de tout fondre dans la même teinte.

## Contexte

**Première story de l'épic 29** (« Navigation et listes »), numérotée `29.0` pour ne pas décaler les dix stories suivantes — insérée après le découpage initial car `UX-DR1`/`UX-DR2` n'avaient aucun porteur alors qu'elles conditionnent les stories **29.5** (signalétique d'état), **29.9** (animations/compte à rebours) et **32.3** (états de scénario et de séance). **Cette story bloque ces trois stories : sans ses tokens, aucune n'a de couleurs à consommer.**

**Portée volontairement étroite** : cette story livre uniquement les **jetons de couleur CSS** (douze valeurs hexadécimales, quatre par thème) et la **règle d'invariant** qui les gouverne, écrite là où un futur auteur de thème la lira. Elle ne construit **pas** le composant `StatusBadge` générique (UX-DR3) ni `StateRail` (UX-DR4) — ceux-ci sont portés par une story ultérieure (probablement 29.5 ou 32.3) qui consommera ces tokens. Ne pas anticiper leur construction ici.

## Acceptance Criteria

1. **Given** le thème Atelier Cuivré aujourd'hui, **When** on inspecte les jetons de couleur, **Then** `status-available` ne dérive plus de `accent-1`, **and** l'urgence cesse d'être indistinguable de la normalité dans ce thème.
2. **Given** chacun des trois thèmes, **When** ses quatre couleurs de statut sont définies, **Then** elles sont distinguables entre elles, **and** elles sont éloignées des deux accents de ce thème, **and** aucune ne dérive d'un accent.
3. **Given** un badge au palier imminent, donc plein, **When** son texte est rendu, **Then** il prend la couleur de fond primaire du thème, jamais du blanc.
4. **Given** un badge d'état terminé, **When** son texte est rendu, **Then** il prend la couleur de texte atténuée, jamais la teinte `status-done` elle-même.
5. **Given** un thème ajouté plus tard, **When** ses couleurs de statut sont écrites, **Then** l'invariant de palette s'applique à lui comme aux trois autres, **and** la règle est écrite là où un futur auteur de thème la lira.
6. **Given** le rouge, **When** on cherche où il est employé, **Then** il n'est réservé par aucune palette de statut, **and** il reste disponible pour une erreur, une action destructive ou une indisponibilité de créneau.

## Tasks / Subtasks

- [x] Task 1 — Ajouter les douze jetons de statut dans `apps/web/src/styles.scss` (AC: #2, #5, #6)
  - [x] Dans chacun des trois blocs de thème existants (`.theme-grimoire-emeraude`, `.theme-foret-ancienne`, `.theme-medieval-steampunk` — **noms de classe actuels, ne pas renommer**, cf. Dev Notes), ajouter 4 nouvelles custom properties `--jdr-status-todo`, `--jdr-status-live`, `--jdr-status-soon`, `--jdr-status-done`, aux emplacements et valeurs exactes ci-dessous (copier-coller, déjà vérifiées contre les deux accents de chaque thème par le contrat d'UX — aucune à recalculer) :
    ```scss
    // .theme-grimoire-emeraude (accents : --jdr-accent-1 #7ec8a4, --jdr-accent-2 #9b6dff)
    --jdr-status-todo:  #f0a030;   // ambre chandelle — ça t'attend
    --jdr-status-live:  #3fd4ff;   // cyan arcanique  — en cours
    --jdr-status-soon:  #ff7ad9;   // rose de sort    — à venir
    --jdr-status-done:  #5a5a6a;   // cendre          — terminé

    // .theme-foret-ancienne (accents : --jdr-accent-1 #2ecc71, --jdr-accent-2 #f0c040)
    --jdr-status-todo:  #ff8a3d;   // orange d'automne
    --jdr-status-live:  #4fd6c1;   // eau claire
    --jdr-status-soon:  #6f8fd8;   // bleu brume
    --jdr-status-done:  #5f6b60;   // lichen

    // .theme-medieval-steampunk (accents : --jdr-accent-1 #cd7f32, --jdr-accent-2 #4a7c59) — thème "Atelier Cuivré" dans les ACs, nom de classe inchangé (AD-13 pas encore appliqué, cf. Dev Notes)
    --jdr-status-todo:  #ffd21f;   // jaune d'alerte
    --jdr-status-live:  #3fb894;   // vert-de-gris — patine du cuivre oxydé
    --jdr-status-soon:  #6f9fd8;   // bleu acier
    --jdr-status-done:  #6b6459;   // fonte
    ```
  - [x] Juste au-dessus de la première déclaration (bloc `.theme-grimoire-emeraude`), écrire l'invariant en commentaire SCSS — **c'est l'emplacement que l'AC5 exige** (« où un futur auteur de thème la lira ») :
    ```scss
    // Invariant de palette de statut (Story 29.0, UX-DR1/UX-DR2) : dans un thème donné, les
    // quatre --jdr-status-* doivent être distinguables entre elles ET éloignées des deux accents
    // (--jdr-accent-1/--jdr-accent-2) de ce thème. Aucune ne dérive d'un accent. Le rouge n'est
    // réservé par aucune palette de statut — il reste disponible pour erreur/action destructive/
    // indisponibilité de créneau (--mat-sys-error, --color-unavailable). Un futur thème DOIT
    // respecter cet invariant en choisissant ses 4 valeurs, jamais en réutilisant --jdr-accent-*.
    ```
  - [x] Vérification visuelle rapide (pas de test automatisé — ce sont des constantes, cf. Dev Notes/Testing) : aucune des 12 valeurs n'appartient à la famille rouge (AC6). Vérification renforcée par un calcul HSL (Node, dans le conteneur `web`) : distances de teinte entre les 4 statuts et les 2 accents de chaque thème. Deux paires signalées de prime abord en Atelier Cuivré (`status-todo`/`status-done` à 11° d'écart de teinte, `status-done`/`accent-1` à 7°) se sont avérées de faux positifs : `--jdr-status-done: #6b6459` n'a que 9 % de saturation contre 61 % pour `--jdr-accent-1` (#cd7f32) — l'écart de saturation (52 points) domine largement la perception malgré la proximité de teinte, cohérent avec l'intention de conception (« fonte », une teinte volontairement délavée pour signifier l'état terminé/en retrait). Aucune correction nécessaire.

- [x] Task 2 — Vérifier l'état réel de `--color-available` en Atelier Cuivré avant de coder quoi que ce soit (AC: #1)
  - [x] **Fait déjà établi par cette analyse, à ne pas re-découvrir** : dans le code actuel, `.theme-medieval-steampunk { --color-available: #4a7c59; }` — cette valeur est déjà celle de `--jdr-accent-2` (bronze vert), **pas** de `--jdr-accent-1` (`#cd7f32`, cuivre). Le défaut décrit par le contrat d'UX (« `status-available: var(--accent-1)` ») correspond au **document de base** (`ux-jdr-master-20260626/DESIGN.md`), pas à une liaison `var()` vivante trouvée dans le code de ce projet — aucune occurrence de `var(--jdr-accent-1)` n'existe dans `apps/web/src` (vérifié par recherche exhaustive).
  - [x] En conséquence, l'AC1 est **déjà satisfait tel quel** pour `--color-available` : `#4a7c59` (accent-2) et le nouveau `--jdr-status-todo` (`#ffd21f`, jaune vif) n'ont aucune parenté de teinte ni de saturation — aucune confusion urgence/normalité possible. Aucun autre endroit du code ne lie une teinte de statut à `--jdr-accent-1` dans ce thème (recherche exhaustive `var(--jdr-accent-1)` négative). Aucun changement de code requis pour `--color-available`.
  - [x] `--color-available` non renommé, non fusionné avec les nouveaux `--jdr-status-*` : systèmes sémantiques distincts confirmés, laissés intacts.

- [x] Task 3 — Documenter le mapping des règles de couleur de texte des badges, pour la story qui construira `StatusBadge` (AC: #3, #4)
  - [x] Dans le même bloc de commentaire que l'invariant (Task 1), ajouter la correspondance pour le futur composant :
    ```scss
    // Mapping pour la future StatusBadge (story ultérieure, hors périmètre de 29.0) :
    //   badge plein (palier imminent)  → texte en --jdr-bg   (fond primaire du thème, jamais blanc)
    //   badge "done"                   → texte en --jdr-text-muted (jamais --jdr-status-done lui-même)
    ```
  - [x] Aucun nouveau token requis pour ces deux règles : `--jdr-bg` et `--jdr-text-muted` existent déjà dans les trois thèmes (vérifié).

### Review Findings

- [x] [Review][Decision] AC3/AC4 sont formulés comme un comportement d'exécution (« quand son texte est rendu »), mais cette story ne livre qu'un commentaire de documentation — aucun composant `StatusBadge` n'existe pour rendre quoi que ce soit. **Décision utilisateur : satisfaits par documentation** — le commentaire de mapping dans `styles.scss` (Task 3) fait foi ; la story qui construira `StatusBadge` re-vérifiera comportementalement AC3/AC4 à ce moment-là. [apps/web/src/styles.scss]
- [x] [Review][Patch] Le commentaire de mapping StatusBadge se lit comme un fait déjà en vigueur (« jamais blanc », « jamais status-done lui-même ») pour un composant qui n'existe pas encore — corrigé : reformulé en « Recommandation... ce composant n'existe pas encore, rien ci-dessous n'est un comportement actuel ». [apps/web/src/styles.scss]
- [x] [Review][Patch] L'essai d'invariant complet n'apparaît qu'au-dessus du premier bloc de thème (Grimoire Émeraude) — corrigé : ligne de renvoi « Invariant complet : cf. commentaire au-dessus de .theme-grimoire-emeraude » ajoutée dans les deux autres blocs. [apps/web/src/styles.scss]
- [x] [Review][Defer] Les valeurs `--jdr-status-done` (#5a5a6a Grimoire, #6b6459 Atelier Cuivré) sont des gris désaturés proches de `--jdr-text-muted`/des teintes de surface — aucune vérification que ces teintes restent distinctes une fois utilisées comme fond de badge derrière un texte atténué. Atténué par le fond à 26 % d'opacité déjà spécifié par le contrat d'UX (pas un aplat), mais la vérification réelle revient à la future story `StatusBadge`. [apps/web/src/styles.scss] — déferré, hors périmètre de cette story (tokens seuls).
- [x] [Review][Defer] L'invariant de palette est documenté en commentaire uniquement, sans application automatisée (pas de lint/CI) — rien n'empêche un futur thème de le violer. Correspond à une limitation déjà acceptée du système de thèmes de ce projet (AD-13 signale la même classe de lacune pour `tones.ts` : le typage `Record<Theme, Record<string,string>>` garantit la présence des trois thèmes mais jamais la complétude par clé). [apps/web/src/styles.scss] — déferré, motif préexistant non introduit par ce diff.
- [x] [Review][Defer] Aucune vérification de ratio de contraste pour le texte qui sera un jour rendu sur ces couleurs de statut — explicitement la responsabilité de la future story `StatusBadge` ; le contrat d'UX source a déjà fait cette analyse (ex. texte blanc sur `status-soon` clair tombant à 2,3-3,2:1). [apps/web/src/styles.scss] — déferré, hors périmètre de cette story.

## Dev Notes

### Anti-réinvention — ce qui existe déjà

| Besoin | Constat | À faire |
|---|---|---|
| Composant affichant un statut avec couleur | `ScenarioStatusBadge` (`apps/web/src/app/features/scenarios/scenario-status-badge/`) existe déjà pour `BROUILLON`/`A_VENIR`/`COURANT`/`PASSE` | **Ne pas y toucher dans cette story.** Il n'est pas le futur `StatusBadge` générique (UX-DR3) — une story ultérieure décidera de le migrer ou de le remplacer. Il illustre d'ailleurs le défaut que 29.0 corrige à la racine : `.status-courant` dérive de `--jdr-accent-1` directement (`scenario-status-badge.scss:21-23`), et `.status-brouillon`/`.status-a-venir` partagent le même traitement (atténué + tireté), rendant les deux indistinguables entre eux. Ne pas corriger ce composant ici — hors périmètre. |
| Tokens de couleur par thème | `apps/web/src/styles.scss`, blocs `.theme-grimoire-emeraude`/`.theme-foret-ancienne`/`.theme-medieval-steampunk` (lignes ~54-260) | Étendre ces blocs existants, ne pas créer de nouveau fichier de tokens. |
| Disponibilité calendrier (2 états) | `--color-available`/`--color-unavailable`/`--color-unknown`/`--color-mixed`, définis dans `:root` (défauts) et surchargés par thème | Système distinct des 4 statuts todo/live/soon/done introduits ici — ne pas fusionner (cf. Task 2). |

### Contrainte critique — le renommage du thème n'est PAS fait

Le contrat d'UX (`DESIGN.md`, 2026-08-04) renomme `medieval-steampunk` → `atelier-cuivre` (affiché « Atelier Cuivré », amendement 4 + AD-13 de la spine). **Ce renommage est explicitement porté par la story 35.1** (« découpe des thèmes et renommage », dernière story du palier — « on ne relit les libellés qu'une fois tous les écrans refondus »), pas par 29.0. Dans le code actuel : la classe CSS reste `.theme-medieval-steampunk`, le slug de thème reste `medieval-steampunk` partout (`tones.ts`, `Theme` type, `User.theme` persisté). **Ajouter les 4 nouveaux tokens sous le nom de classe actuel** — ne pas renommer quoi que ce soit, ne pas anticiper AD-13, sous peine de conflit avec la story 35.1 qui refera ce travail en profondeur (fichier par thème, migration des valeurs persistées).

### Nommage des tokens — décision à respecter

Les tokens per-thème existants suivent le préfixe `--jdr-*` (`--jdr-accent-1`, `--jdr-bg`, `--jdr-text`, `--jdr-text-muted`…) — **pas** le nommage nu `status-todo` du document de contrat (`DESIGN.md` utilise une notation YAML abstraite `{colors.status-todo}`, pas un nom de custom property CSS littéral). Suivre la convention du code, pas celle du document : `--jdr-status-todo`, `--jdr-status-live`, `--jdr-status-soon`, `--jdr-status-done`.

### Testing

**Aucun test automatisé applicable.** Cette story ajoute des constantes CSS statiques (custom properties), sans logique de composant, sans DTO, sans endpoint. La vérification est **visuelle** (Task 1, dernière sous-tâche) — cohérent avec l'absence de précédent dans ce projet pour une story « tokens seuls ». Ne pas inventer un test Vitest/Jest qui n'aurait rien à exercer.

### Temps réel (checklist `docs/checklist.md`)

Aucun besoin de câblage SSE — cette story ne touche aucune donnée scopée à une Partie ni à l'utilisateur, uniquement des tokens de style statiques.

### Project Structure Notes

- **Seul fichier modifié** : `apps/web/src/styles.scss`.
- **Non touchés** : `apps/web/src/app/core/theme/tones.ts` (texte uniquement, cf. P8-AD-9 — aucune couleur n'y transite), `scenario-status-badge.*` (cf. Anti-réinvention), tout composant de calendrier.
- Aucune migration Prisma, aucun changement d'API — story purement frontend/CSS.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.0] — Story, Acceptance Criteria (reprises telles quelles), note de séquencement de l'épic 29
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 29 : Navigation et listes] — « la story 29.0 ouvre l'épic », prérequis dur de 29.5/29.9/32.3
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md#2. Colors] — Les 12 valeurs hexadécimales, l'invariant, la note de conception Atelier Cuivré, la règle des couleurs de texte de badge (§7.1 StatusBadge)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md] — Définition de base de `primary-bg`/`text-muted`/`status-available` (document hérité, non littéralement présent dans le code actuel)
- [Source: apps/web/src/styles.scss:41-178] — Blocs de thème existants à étendre, tokens `--jdr-*` et `--color-*` actuels
- [Source: apps/web/src/app/features/scenarios/scenario-status-badge/scenario-status-badge.scss] — Défaut illustratif (dérivation directe de `--jdr-accent-1`), à ne pas corriger dans cette story

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `docker compose exec web pnpm build` → build Angular propre (styles compilés à 12.89 kB, seul l'échec pré-existant de budget bundle persiste, delta +0.32 kB non significatif).
- Vérification HSL (Node dans le conteneur `web`) sur les 12 nouvelles valeurs contre les accents de chaque thème : voir Task 1 pour le détail des deux faux positifs de teinte pure écartés par l'analyse de saturation.
- Recherche exhaustive `var(--jdr-accent-1)` dans `apps/web/src` → aucune occurrence (confirme que le défaut du document de base n'est pas littéralement présent dans le code).
- `docker compose exec web pnpm test` → 82 fichiers, 1098 tests, tout vert, aucune régression.
- Revue de code (`bmad-code-review`, 3 couches parallèles) → 1 decision-needed (AC3/AC4 satisfaits par documentation, décision utilisateur), 2 patchs appliqués (reformulation du commentaire StatusBadge en recommandation, ajout de renvois vers l'invariant dans les 2 autres blocs de thème), 3 items déferrés dans `deferred-work.md` (contraste badge `done`, absence d'application automatisée de l'invariant, vérification de ratio de contraste — tous explicitement hors périmètre, pour la future story `StatusBadge`), 7 findings dismissés comme bruit après vérification (dont un contredit par le calcul HSL déjà effectué). Rebuild propre après application des patchs.

### Completion Notes List

- Les 12 jetons `--jdr-status-{todo,live,soon,done}` ajoutés dans les 3 blocs de thème de `apps/web/src/styles.scss`, valeurs exactes du contrat d'UX, aucune recalculée.
- Invariant de palette et mapping de couleur de texte des futurs badges documentés en commentaire SCSS juste au-dessus du premier bloc de thème (AC5).
- AC1 confirmé déjà satisfait par l'état existant du code (`--color-available` en Atelier Cuivré vaut déjà `accent-2`, pas `accent-1`) — aucun changement de code nécessaire, uniquement une vérification documentée.
- Aucun composant existant modifié (`ScenarioStatusBadge` intentionnellement laissé intact, cf. Dev Notes Anti-réinvention) — story strictement limitée aux tokens CSS, conformément à sa portée déclarée.
- Aucun test automatisé ajouté (story de constantes CSS statiques, sans logique — cf. Dev Notes/Testing) ; vérification par build + suite de régression existante + calcul HSL manuel.

### File List

- `apps/web/src/styles.scss`
