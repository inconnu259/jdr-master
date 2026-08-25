---
title: jdr-master Experience Spec — Delta Sessions, rapports, événements/missions, annonces MJ (Palier 4)
status: final
updated: 2026-07-11
design_ref: DESIGN.md
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260711/prd.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/EXPERIENCE.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/EXPERIENCE.md"
---

# jdr-master — Experience Specification — Delta Sessions, rapports, événements/missions, annonces MJ (Palier 4)

Palier 4 (finalisation, hors flow « agence » complet — Palier 8, et hors calendrier/vote de date/infra e-mail — déjà livrés Epics 1-3/5) : Scénario (unité de contenu narratif, one-shot = un scénario unique), cycle de vie avec anti-spoil (`Brouillon`→`À venir`→`Courant`→`Passé`), Séances multiples, rétrospective (comptes-rendus + résumé de fin + association journal), participation linéaire vs épisodique, inscription à capacité limitée, annonces MJ. **Delta** sur `ux-jdr-master-20260708/EXPERIENCE.md` (évolution du personnage), lui-même delta sur `20260703` (fiche Ryuutama) et `20260626` (spine de base — IA globale, voix, socle d'accessibilité). Tokens visuels : `DESIGN.md` (ce dossier).

En cas de conflit avec un mock (`mockups/`), **ce document et DESIGN.md gagnent**.

---

## 1. Foundation

**Form-factor** : mobile + desktop, avec une **divergence structurelle nouvelle** — `ScenarioTimeline` change complètement d'orientation (horizontale ↔ verticale) selon le viewport, pas seulement de densité comme les compositions héritées (RosterRail replié/déplié). Seuil : `{spacing.bp-tablet}` (768px), cohérent avec le token existant.

**UI system** : Angular Material 22, standalone components, signals — identique au reste de l'app.

**Entité Séance, enfin introduite** : `ux-jdr-master-20260708/EXPERIENCE.md` §1 notait explicitement l'absence d'entité Séance formelle, différée « au palier suivant ». C'est ce palier. Tout ce qui, dans le delta précédent, était organisé par date brute faute d'entité Séance (historique XP, journal de notes) **reste inchangé** — ce delta n'introduit pas de migration rétroactive, il pose Scénario/Séance comme nouvelles entités pour le contenu qui apparaît à partir de maintenant.

---

## 2. Information Architecture

### Scénario comme unité pivot

```
Partie (kind: ONE_SHOT | CAMPAGNE_LINEAIRE | CAMPAGNE_EPISODIQUE)
└── Scénario(s)                          — un seul pour ONE_SHOT (créé automatiquement, [ASSUMPTION] cf. PRD §9)
    ├── Statut : Brouillon → À venir → Courant → Passé
    ├── Description + documents (scénario + bibliothèque de Partie)
    ├── Participants (implicite en linéaire, choix individuel en épisodique)
    ├── Séance(s) — une ou plusieurs si le scénario dépasse une soirée
    │   └── Date : vote existant (linéaire/one-shot) OU inscription à capacité limitée (épisodique)
    └── Rétrospective (dès clôture)
        ├── Comptes-rendus de séance (un par séance)
        ├── Résumé de fin (MJ, riche)
        └── Journal des joueurs associé (configurable)
```

### Vue chronologique (page détail de Partie, `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE`)

Nouvelle section sur la page détail de Partie (à côté de Calendrier/Vote/Invitations hérités) : `ScenarioTimeline` (cf. DESIGN.md §4/§7). Un one-shot n'a pas de timeline — un seul scénario, affiché directement en page détail de Partie sans navigation intermédiaire.

**Ancrage au chargement** : la vue horizontale (desktop) se positionne d'emblée sur le scénario `Courant` — jamais tout à gauche (le passé le plus ancien) par défaut. Cohérent avec la lecture « fil d'actualité qui s'ouvre à aujourd'hui » validée en Discovery.

**Vue MJ des `Brouillon`** : liste séparée, accessible uniquement au MJ (ex. section repliée en bas de la timeline ou onglet dédié — `[ASSUMPTION]`, à trancher en implémentation, aucun mock produit pour cette vue secondaire), jamais mêlée à la timeline principale (qui reste, elle, potentiellement visible par un joueur). Actions : créer un `Brouillon`, l'ouvrir (`Brouillon`→`À venir`, FR-7).

### Fiche scénario (détail)

Cf. `mockups/fiche-scenario-20260711.html` — 3 états validés en Discovery : `Courant` (linéaire), `Courant` (épisodique), `Passé` (rétrospective). Voir §4 Component Patterns pour la composition détaillée de chaque état.

### Annonces MJ

Pas de nouvelle page dédiée — les annonces s'affichent **au niveau où elles sont scopées** : liste sur la page détail de Partie (scope Partie/campagne), sur la fiche scénario (scope one-shot ou scénario précis, cf. `RetrospectivePanel`/`ScenarioCard` §annonces-liees). Pas de fil unique centralisé toutes-portées-confondues en v1 — cohérent avec le principe « la bonne audience au bon endroit » du PRD (FR-20).

---

## 3. Voice and Tone

Nouvelles clés de microcopy `sessions.*`, suivant le triple habillage déjà établi (une valeur par thème — grimoire/forêt/steampunk à compléter au même registre que l'existant) :

| Clé | Grimoire Émeraude (référence) |
|---|---|
| `sessions.scenario_status_brouillon` | "Brouillon" |
| `sessions.scenario_status_avenir` | "À venir" |
| `sessions.scenario_status_courant` | "En cours" |
| `sessions.scenario_status_passe` | "Passé" |
| `sessions.scenario_close_cta` | "Clôturer le scénario" |
| `sessions.scenario_open_cta` | "Ouvrir aux joueurs" |
| `sessions.retrospective_title` | "Résumé de fin" |
| `sessions.compte_rendu_empty` | "Aucun compte-rendu pour le moment" |
| `sessions.journal_auto_associate` | "Association automatique" |
| `sessions.inscription_validate_cta` | "Valider cette date" |
| `sessions.inscription_another_date_cta` | "Proposer une autre date" |
| `sessions.inscription_full` | "Complet — inscriptions closes" |
| `sessions.annonce_scope_partie` | "Toute la campagne" |
| `sessions.annonce_scope_scenario` | "Ce scénario" |
| `sessions.library_tag` | "bibliothèque campagne" |
| `sessions.timeline_scroll_hint` | "molette, glisser-déposer, ou trackpad" |

**Règle héritée** : thème et tonalité couplés, pas de choix indépendant. `sessions.scenario_status_courant` volontairement rendu "En cours" plutôt que littéralement "Courant" en microcopy joueur — plus naturel à l'oral ; le mot "Courant" reste le nom technique du statut (Glossaire PRD), pas la chaîne affichée.

---

## 4. Component Patterns

### ScenarioTimeline

Cf. DESIGN.md §4/§7 pour le détail responsive (horizontal desktop / vertical mobile) et les corrections d'alignement (en-tête de nœud à hauteur fixe). Comportement : clic sur un nœud `Passé`/`Courant` ouvre la fiche scénario correspondante ; clic sur un nœud `À venir` ouvre une vue restreinte (titre + date + vote/inscription uniquement, cf. §5 State Patterns anti-spoil) ; les nœuds `Brouillon` n'apparaissent jamais dans cette timeline (vue MJ séparée, cf. §2).

### Fiche scénario — état `Courant`, linéaire

Séquence de lecture : titre + statut → description → documents (scénario, puis bibliothèque de campagne si présente) → participants (`CharacterSummaryCard`, tous les membres, implicite) → séance (vote de date existant, FR-12) → action MJ « Clôturer le scénario » (FR-10).

### Fiche scénario — état `Courant`, épisodique

Même structure, trois différences : (1) participants = liste des joueurs ayant individuellement choisi ce scénario (FR-18, pas tous les membres de la Partie) ; (2) séance = `FillIndicator` + décision MJ explicite plutôt que vote — cf. « Inscription à capacité limitée » ci-dessous ; (3) le CTA « Clôturer le scénario » passe en style secondaire discret (`btn-danger-outline`, cf. DESIGN.md §7 `ScenarioCard.actions-mj`) plutôt qu'en CTA gradient plein — volontaire : plusieurs scénarios pouvant être `Courant` en parallèle, la clôture est une action moins fréquente et plus définitive ici qu'en linéaire (où c'est la seule façon de faire progresser la campagne), pas une incohérence visuelle.

### Inscription à capacité limitée (FR-19)

1. Le MJ propose une date pour une fourchette min-max (ex. 4 à 6 joueurs).
2. Les joueurs intéressés s'inscrivent (bouton simple, pas de formulaire) ; le compteur et `FillIndicator` se mettent à jour en direct.
3. **Dès que le maximum est atteint, l'inscription se ferme automatiquement** (`sessions.inscription_full`) — plus aucun joueur ne peut s'ajouter.
4. **Le MJ garde systématiquement la main sur la validation** : deux actions restent disponibles à tout moment quel que soit le remplissage — « Proposer une autre date » (si le nombre d'inscrits ne le satisfait pas, même au maximum) ou « Valider cette date » (même en dessous du minimum, si le MJ estime que ça suffit). **Aucune de ces deux actions ne se déclenche automatiquement.**
5. Une fois validée, la séance passe en date confirmée (même affichage qu'une date de vote validée en linéaire).

**Différence avec le vote linéaire (FR-12)** : le vote linéaire aboutit à une date « la plus votée », consultative ; l'inscription épisodique a un hard cap numérique et un geste de validation explicite du MJ — deux mécanismes distincts, jamais fusionnés (cf. PRD, Dev Notes « pourquoi deux chemins »).

### Rétrospective (`RetrospectivePanel`, clôture de scénario)

1. À la clôture (FR-10), le MJ est invité à rédiger le résumé de fin (FR-15) — pas obligatoire au moment précis de la clôture, mais le panneau reste vide/incitatif tant que non rempli (cf. §5 State Patterns).
2. Les comptes-rendus de séance déjà rédigés en cours de route (FR-14, un par séance) restent affichés au-dessus ou en dessous du résumé — ordre chronologique, résumé de fin en premier (vue d'ensemble avant le détail séance par séance).
3. **Association du journal** (FR-16, configurable) : le joueur voit un switch « Association automatique ». Activé : toute entrée de son journal personnel déjà partagée (`shared: true`) et datée dans la fenêtre du scénario apparaît sans geste supplémentaire. Désactivé (défaut) : le joueur coche manuellement, entrée par entrée, ce qui apparaît dans la rétrospective — reprend le pattern `NotesJournal.entry` existant, avec une case à cocher additionnelle.
4. Annonces liées au scénario (FR-20, scope scénario) affichées en pied de panneau.

### Documents (par scénario et par Partie/campagne, FR-2/FR-3)

Deux listes visuellement regroupées dans la même section « Documents » d'une fiche scénario : les documents propres au scénario (masqués tant qu'il n'est pas `Courant`/`Passé`, cf. anti-spoil §5) et, en dessous ou avec un tag distinct (`sessions.library_tag`), les documents de la bibliothèque de Partie/campagne — **toujours visibles**, jamais soumis à l'anti-spoil (ce sont des règles maison/du lore général, pas du contenu spécifique au scénario en cours). Upload : `[ASSUMPTION]` réutilise le pattern d'upload de portrait existant (Story 4.5), plafond provisoire 5 Mo — cf. PRD §9 Assumptions Index.

### Participants (`CharacterSummaryCard` réutilisé)

Décision explicite de Discovery : un badge texte "Prénom + emoji" est ambigu (joueur ou personnage ?). `CharacterSummaryCard` (existant, `ux-jdr-master-20260703`) résout déjà ce problème — avatar, **nom du personnage** en emphase, **classe** en sous-titre, **pseudo du joueur** en badge discret, carte cliquable vers l'aperçu complet du personnage. Aucun nouveau composant : juste un nouveau contexte d'usage (liste de participants d'un scénario, au lieu du roster de Partie).

### Annonces (`AnnonceCard`)

**Publication** : formulaire minimal (texte libre + sélecteur de portée — Partie/campagne, one-shot, ou scénario précis, cf. FR-20).
- Le sélecteur de portée liste **uniquement** les scénarios `Courant`/`Passé` du MJ — un scénario `Brouillon` ou `À venir` n'est jamais une option de portée (annoncer quelque chose de scopé à un contenu pas encore révélé n'a pas de sens et fuiterait indirectement son existence).
- Soumission avec un texte vide : bouton de publication désactivé tant que le champ est vide (pas de soumission puis message d'erreur après coup).
- Pas de limite de caractères stricte en v1 (`[ASSUMPTION]`, cohérent avec l'absence de limite similaire sur la description de scénario ou le résumé de fin).

**Affichage** : liste chronologique inversée (plus récent en premier), avec le libellé de portée toujours visible (`AnnonceCard.scope-label`, cf. DESIGN.md §7) — jamais une annonce sans contexte de diffusion.

---

## 5. State Patterns

| État | Comportement |
|---|---|
| Scénario `Brouillon` | Invisible dans toute vue joueur (timeline, annonces, recherche) — visible uniquement dans la vue MJ dédiée (§2) |
| Scénario `À venir` | Titre + date(s) proposée(s) uniquement visibles côté joueur ; description/documents/participants détaillés masqués — le joueur peut néanmoins voter/s'inscrire sur la date sans connaître le contenu |
| Scénario `Courant` | Contenu complet visible aux participants (documents, description) ; visible en lecture pour tout membre de la Partie même non-participant (cohérent avec l'anti-spoil qui protège le contenu, pas l'existence du scénario, une fois ouvert) |
| Scénario `Passé` | Contenu complet + rétrospective, lecture seule pour tout membre |
| Plusieurs scénarios `Courant` (épisodique) | Timeline affiche les cartes empilées au même point (cf. DESIGN.md §4) ; aucune notion de « le » scénario en cours, une liste |
| Tentative d'ouverture d'un 2ᵉ scénario `Courant` en linéaire (FR-9) | Rejetée avec un message explicite au MJ (`sessions.scenario_already_courant`, ex. « Un scénario est déjà en cours — clôturez-le avant d'en ouvrir un autre ») ; ne s'applique pas en épisodique |
| Inscription épisodique à 0 inscrit | `FillIndicator` affiche déjà l'état `{colors.status-unavailable}` (sous le minimum) dès l'ouverture — pas un état « vide » distinct, la barre est visible et non ambiguë dès la création de la séance |
| Inscription épisodique sous le minimum | `FillIndicator` en `{colors.status-unavailable}`, le MJ peut quand même valider (jamais bloqué techniquement) |
| Inscription épisodique entre min et max | `FillIndicator` en `{colors.status-mixed}` |
| Inscription épisodique au maximum | `FillIndicator` en `{colors.status-available}` **et** inscription fermée automatiquement — mais la date n'est PAS validée automatiquement, le CTA MJ reste une action requise |
| Deux joueurs s'inscrivent au dernier créneau simultanément (course, FR-19) | Un seul obtient la place (premier arrivé, verrouillage serveur) ; l'autre voit le bouton se désactiver avec `sessions.inscription_full` sans rechargement manuel nécessaire — jamais une double inscription silencieuse au-delà du maximum |
| Résumé de fin non rempli, scénario `Passé` | Panneau incitatif (pas un vide silencieux) — invite le MJ à le rédiger, sans bloquer la consultation des comptes-rendus déjà présents |
| Association journal, réglage désactivé (défaut) | Case à cocher par entrée, aucune association implicite |
| Association journal, réglage activé | Association automatique par date de partage ; désactiver le réglage ensuite ne retire pas les entrées déjà associées manuellement au préalable |
| Modification d'un scénario après invitation envoyée (FR-4) | Aucune notification automatique — le joueur voit le contenu à jour à sa prochaine consultation (pas de diff, pas de « modifié le [date] » en v1) |
| Document de bibliothèque de campagne | Toujours visible, quel que soit le statut de n'importe quel scénario — jamais anti-spoil |

---

## 6. Interaction Primitives

Hérite du socle existant. Nouveautés :
- **Défilement horizontal `ScenarioTimeline`** (desktop) : molette verticale interceptée et convertie en `scrollLeft` (comportement non natif, à implémenter explicitement — pattern déjà éprouvé en mock, cf. `mockups/`) ; glisser-déposer à la souris en alternative (`cursor: grab` → `grabbing` pendant le drag) ; scroll au trackpad natif inchangé.
- **Switch d'association automatique** (`RetrospectivePanel`) : toggle binaire, pas une case à cocher — signale un réglage persistant, pas une action ponctuelle (cohérent avec la distinction déjà établie pour `NotesJournal.share-toggle`).
- **Inscription à capacité limitée** : bouton simple « S'inscrire »/« Se désinscrire » (pas de formulaire, pas de confirmation modale) — le hard cap au maximum est la seule contrainte bloquante, gérée en désactivant le bouton une fois complet plutôt qu'en affichant une erreur après coup.

---

## 7. Accessibility Floor

Hérite intégralement le socle de `ux-jdr-master-20260626/EXPERIENCE.md` §7 (touch targets 44px mobile/36px desktop, contraste 4.5:1/3:1, couleur jamais seul vecteur d'information, dark mode strict, pattern aria-label `"[Nom] : [état]"`).

**Ajouts spécifiques à ce delta :**
- **Anti-spoil = principe de rendu, pas seulement de style.** Un scénario `Brouillon` ou le contenu masqué d'un `À venir` ne doit jamais rester visible en clair dans l'UI d'un client joueur, même caché en CSS (`display:none`) — un simple masquage visuel serait inspectable via les outils navigateur. **Décision produit (2026-07-12, cf. architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md AD-6) : le filtrage reste côté frontend uniquement, pas de suppression côté API — y compris pour les fichiers de documents.** En contexte hobby, le risque qu'un joueur techniquement curieux inspecte la réponse API ou l'URL de téléchargement d'un document pour spoiler sa propre partie est accepté ; le composant Angular doit donc masquer la donnée de façon systématique et cohérente (rendu conditionnel sur `status`/`viewerIsMj`, y compris le lien de téléchargement).
- `ScenarioStatusBadge` : jamais la couleur seule — chaque état porte un libellé texte (`sessions.scenario_status_*`) en plus de la couleur/bordure, cohérent avec le socle hérité.
- `FillIndicator` : la valeur numérique (`[nb]/[max] inscrits`) est toujours affichée en texte à côté de la barre, jamais uniquement la couleur de remplissage — même règle que `EncumbranceBar` hérité.
- `ScenarioTimeline` (desktop) : le défilement molette/glisser-déposer est un **confort**, pas le seul moyen d'accès — navigation clavier (Tab) doit atteindre chaque nœud dans l'ordre chronologique, avec `scroll-into-view` automatique au focus (même exigence que `capability-choice-grid` hérité pour une zone scrollable).
- Switch d'association automatique : `aria-label="Association automatique du journal à la rétrospective"`, état exposé via `aria-checked` (pattern natif `<input type="checkbox" role="switch">` ou équivalent Angular Material).
- `AnnonceCard` : le libellé de portée (`scope-label`) fait partie du contenu textuel lu par un lecteur d'écran, jamais seulement une couleur d'accent distinctive.

---

## 8. Key Flows

**Mockups de référence** (`mockups/`) : [timeline-A-responsive-20260711.html](mockups/timeline-A-responsive-20260711.html) (ScenarioTimeline, horizontal desktop / vertical mobile, résolution des bugs d'alignement/scroll constatés en Discovery), [fiche-scenario-20260711.html](mockups/fiche-scenario-20260711.html) (3 états : Courant linéaire, Courant épisodique, Passé/rétrospective, avec participants via `CharacterSummaryCard`).

**UJ-1. Sylas (MJ) crée et lance un one-shot, puis le clôture.**

Sylas crée un nouveau one-shot « Le Marché aux Ombres » ; le scénario unique est généré automatiquement pour cette Partie. Il rédige la description, joint la lettre du marchand Ossian (document scénario) et le plan du quartier. Il invite ses joueurs (invitation existante, inchangée). Deux jours plus tard, il relit la description et corrige un détail — aucun message d'erreur, aucune notification envoyée, le contenu est simplement à jour à la prochaine consultation des joueurs. Il déclare ses disponibilités, attend celles du groupe, propose deux dates via le vote existant. **Climax** : la séance jouée, il ouvre la fiche scénario, rédige le résumé de fin (« Arek a fait s'effondrer une passerelle... »), puis clique « Clôturer le scénario ». **Résolution** : le scénario passe `Passé`, consultable en lecture complète par tous, y compris les documents et la description qui ne sont plus soumis à aucune restriction.

**UJ-2. Alice (joueuse) suit une campagne linéaire et rattrape une séance manquée.**

Alice ouvre la page de « Les Chroniques d'Ashvale », consulte `ScenarioTimeline` : le scénario « Les Docks silencieux » est `Passé`, celui en cours (« Le Marché aux Ombres ») affiche 3 participants sur 4 inscrits sur une date, et un scénario `À venir` n'affiche qu'un titre verrouillé « 🔒 Sans titre révélé » avec une date proposée. Elle n'a pas pu venir à la dernière séance des Docks silencieux : elle clique dessus, lit le résumé de fin et les deux comptes-rendus de séance rédigés par Sylas — elle comprend ce qui s'est passé sans avoir eu à demander autour d'elle. **Climax** : elle ouvre son propre journal, écrit une entrée rétroactive sur ce qu'elle imagine avoir manqué, et active « Association automatique » pour qu'elle apparaisse dans la rétrospective sans geste supplémentaire à chaque nouvelle entrée partagée.

**UJ-3. Sylas (MJ) planifie une séance de campagne épisodique.**

Dans « L'Agence des Ombres » (épisodique), Sylas ouvre le scénario « La Dette du Forgeron », propose une date pour 4 à 6 joueurs. Au fil des heures, `FillIndicator` passe de rouge (2 inscrits) à ambre (5 inscrits, entre min et max). **Climax** : plutôt que d'attendre le maximum, Sylas juge que 5 joueurs suffisent pour cette enquête et clique directement « Valider cette date » — le système ne l'en empêche pas, la décision reste toujours la sienne, jamais automatique même si le seuil n'est pas atteint. **Résolution** : la date se confirme, les inscriptions pour cette séance se ferment (les inscrits restent les 5, un 6ᵉ joueur intéressé après coup ne peut plus rejoindre cette séance précise).

**UJ-4. Sylas (MJ) prépare un scénario qui dépend de l'issue du précédent.**

Sylas sait que l'ouverture de « Le Pacte Rompu » dépend de si le groupe a épargné ou tué le contrebandier Silas dans le scénario précédent.

1. Depuis la page de sa campagne, il ouvre la **vue MJ des Brouillons** (liste séparée de `ScenarioTimeline`, jamais mêlée à la vue joueur, cf. §2) et clique « + Nouveau scénario ».
2. Il rédige la description et joint ses documents dès maintenant — le scénario est créé au statut `Brouillon`, invisible pour les joueurs, il reste dans cette liste MJ tant qu'il n'est pas ouvert.
3. Rien ne se perd si la séance en cours (« Les Docks silencieux ») tarde à se conclure : le brouillon attend, modifiable à volonté, sans date ni participants tant qu'il n'est pas ouvert.

**Climax** : une fois « Les Docks silencieux » clôturé et le sort de Silas connu, Sylas rouvre le brouillon depuis cette même vue MJ, ajuste la description en fonction de l'issue réelle, puis clique « Ouvrir aux joueurs » — le scénario passe `À venir`, quitte la vue Brouillon, et apparaît pour la première fois dans `ScenarioTimeline` (titre + date seulement, cf. anti-spoil §5). **Résolution** : les joueurs voient désormais son titre et peuvent voter une date, sans jamais avoir eu connaissance de son existence pendant qu'il était en préparation.

---

## 9. Responsive & Platform

Hérite des breakpoints du spine (`{spacing.bp-mobile}` 480px, `{spacing.bp-tablet}` 768px, `{spacing.bp-desktop}` 1024px). Seuil pertinent pour `ScenarioTimeline` : `{spacing.bp-tablet}` (768px) — en dessous, bascule sur le pattern vertical (§2/DESIGN.md §4), pas de mode intermédiaire à des largeurs de tablette contrairement au `RosterRail` hérité (seuil 1024px, composant différent, pas de contrainte de cohérence entre les deux seuils).
