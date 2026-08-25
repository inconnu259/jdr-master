---
title: jdr-master Experience Spec — Delta Évolution du personnage (Palier 3)
status: final
updated: 2026-07-10
design_ref: DESIGN.md
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/EXPERIENCE.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/addendum.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/EXPERIENCE.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/EXPERIENCE.md"
  - "_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-06-27/ARCHITECTURE-SPINE.md"
---

# jdr-master — Experience Specification — Delta Évolution du personnage (XP, niveau, inventaire, notes, édition MJ)

Palier 3 (hors export PDF, déjà livré Épic 4) : distribution d'XP, montée de niveau guidée, inventaire chiffré, journal de notes, historique en lecture seule, édition MJ champ-par-champ. **Delta** sur `ux-jdr-master-20260703/EXPERIENCE.md` (création/fiche Ryuutama), lui-même delta sur `ux-jdr-master-20260626/EXPERIENCE.md` (spine de base — IA globale, voix, socle d'accessibilité). Tokens visuels : `DESIGN.md` (ce dossier).

En cas de conflit avec un mock (`mockups/`), **ce document et DESIGN.md gagnent**.

**Amendements au PRD** (`prd-jdr-master-20260707/prd.md`, status: final) actés pendant cette Discovery UX, à reporter au PRD :
- **FR-11 (Notes personnelles)** : forme changée d'une note unique en texte libre vers un **journal chronologique** d'entrées datées, chacune partageable individuellement avec le groupe (pas seulement visible MJ comme prévu initialement). Cf. §4 Notes.

**Update (post-final, 2026-07-10)** : suite aux retours utilisateur après plusieurs montées de niveau réelles en environnement de test, complète FR-8 (capacités "enregistrées sur la fiche et affichées") qui n'avait été traité qu'en implémentation comme un simple journal plat — ce delta ajoute l'intégration **structurelle** des capacités choisies dans les sections existantes de la fiche (Vocation, Voie), une nouvelle section Paysage/Climat, une section Immunités, l'affichage de l'XP (absent jusqu'ici), et corrige le débordement du `LevelUpWizard` sur les choix à liste longue. Cf. §2, §4, §5 ci-dessous pour le détail.

**Update 2 (post-final, 2026-07-10)** : trois raffinements supplémentaires demandés par l'utilisateur après usage du round précédent — (1) le résumé de bas de fiche ("Choix de montée de niveau") est **fusionné dans Historique** plutôt que dupliqué en deux endroits : chaque instantané `LEVEL_UP` affiche désormais directement le choix de capacité fait à ce niveau ; (2) les capacités sans section dédiée (Protection d'un dragon, Voyage légendaire, et tout type futur du même genre) obtiennent leur propre petit encart **"Autres capacités"** plutôt que de rester cantonnées au résumé ; (3) la section **Attributs** passe en tête de la colonne gauche ("hyper important", devrait "limite être le premier encart") — devant Vocation/Voie, qui suivaient jusqu'ici juste après le nom du personnage. Cf. §2, §4, §5.

**Update 3 (post-final, 2026-07-10)** : dans la section "Autres capacités", le préfixe "Niveau [N] —" est retiré (le niveau est déjà visible dans Historique, cf. update 2) — l'encart liste directement les descriptions, sans redondance.

---

## 1. Foundation

**Form-factor** : mobile + desktop. **Ce delta introduit une IA différenciée par rôle sur une même page** (détail de Partie) — première occurrence dans le produit d'un rôle qui change la structure de navigation, pas seulement la densité d'affichage (cf. §2). Cohérent avec le principe hérité "mobile-first joueur / desktop-first MJ", poussé un cran plus loin.

**UI system** : Angular Material 22, standalone components, signals — identique au reste de l'app.

**Pas d'entité Séance** : ce palier n'introduit aucune notion de session/séance formelle (différée, cf. `[NOTE FOR PM]` PRD §6.2). Tout ce qui, dans ce document, ressemble à une chronologie (historique XP, journal de notes) est organisé par **date brute**, pas par un lien vers une séance — à réévaluer quand l'entité Séance existera (palier suivant), sans que cela bloque ce palier-ci.

---

## 2. Information Architecture

### Restructuration de la page détail de Partie

**Desktop (≥1024px)** — remplace l'ancien onglet "Personnages" (`ux-jdr-master-20260703`) par un **RosterRail** permanent (cf. DESIGN.md §7), replié par défaut (icônes seules, 64px), dépliable au clic (260px, noms + niveaux). Les onglets restants (Calendrier, Vote) passent en pleine largeur du contenu principal ; un nouvel onglet **Invitations** apparaît à côté (gestion des invitations/recherche de compagnon, séparé de la troupe).

```
App
└── Mes parties
    └── [Partie]
        ├── RosterRail (permanent, gauche) — remplace l'onglet Personnages
        │   ├── Un item par participant (MJ inclus, indicateur visuel dédié)
        │   └── Slot "+ Inviter" (dernier item, visible seulement si place libre)
        ├── Calendrier (inchangé, contenu pleine largeur)
        ├── Vote (inchangé, contenu pleine largeur)
        └── Invitations (NOUVEAU, onglet séparé)
            └── Liens d'invitation actifs/acceptés — un lien révoqué disparaît totalement de la liste (cf. §5 State Patterns)
```

**Mobile (<768px)** — **diverge par rôle** :

- **MJ** : RosterStrip horizontale scrollable sous le titre de la Partie (mêmes participants que le RosterRail desktop, réinterprétés à l'horizontale), onglets Calendrier/Vote/Invitations en dessous. Le MJ a besoin de la vue d'ensemble de la troupe pour ses actions (distribution XP, édition).
- **Joueur** : **pas de bandeau troupe par défaut**. Navigation réduite à l'essentiel : **Ma fiche** (onglet par défaut), Calendrier, Vote. Un lien texte discret ("Voir la troupe") donne accès aux autres personnages en un clic supplémentaire — jugé acceptable, un joueur consulte rarement les fiches des autres.

**Justification (Discovery, utilisateur)** : *"Le joueur sera surtout intéressé d'avoir accès à son personnage [...] je pense que voir les autres personnages sera pas hyper important pour lui."* — la même page sert donc un IA différente selon qui la consulte, plutôt qu'un compromis unique pour les deux rôles.

**Personnage → fiche** : inchangé dans son principe (accès depuis le RosterRail/RosterStrip ou l'onglet Ma fiche), mais la fiche elle-même gagne 4 nouvelles zones : bannière de montée de niveau (§4), onglet/section Inventaire (§4), onglet/section Notes — journal (§4), section Historique en lecture seule (§4).

**Update (post-final)** — les capacités choisies via le `LevelUpWizard` s'intègrent dans la structure existante de la fiche plutôt que dans un seul journal plat, à égalité avec Équipement/Notes narratives :
- **Attributs** : en tête de la colonne gauche, **avant** Vocation/Voie — l'information la plus consultée sur la fiche (utilisateur : "hyper important, ça devrait limite être le premier encart").
- **Vocation** (classe) : la classe secondaire (niveau 5) apparaît en sous-bloc sous la classe initiale, avec ses propres talents.
- **Voie** (type) : le type secondaire (niveau 6) apparaît en sous-bloc sous les avantages du type initial, avec ses propres avantages.
- **Paysage/Climat favori** (nouvelle section) : liste les paysages/climats obtenus (jusqu'à 2, niveaux 3 et 7), absente tant qu'aucun n'est encore obtenu.
- **Immunités** (nouvelle section) : liste les états d'immunité obtenus (niveau 4), absente tant qu'aucune n'est encore obtenue.
- **Autres capacités** (nouvelle section, update 2) : petit encart listant les capacités sans section dédiée (Protection d'un dragon niveau 9, Voyage légendaire niveau 10, tout type futur du même genre), absente tant qu'aucune n'est obtenue — même registre visuel que Immunités.
- **XP** : affiché comme statistique supplémentaire au même titre que PV/PE/Condition/Initiative/Encombrement (§4 Component Patterns) — absent jusqu'ici, oubli corrigé.
- **Historique** (update 2) : chaque instantané `LEVEL_UP` affiche désormais aussi le choix de capacité fait à ce niveau (fusionné avec l'ancien résumé de bas de fiche, qui n'existe plus comme section séparée) — cf. §4.

### Historique des distributions d'XP (vue MJ)

Section permanente sur la page détail de Partie (pas seulement dans le panneau de distribution) : liste chronologique simple (date, montant total, répartition par joueur, bonus le cas échéant). Présentation volontairement minimale pour ce palier — regroupement par séance, filtres, etc. sont différés au palier Séances/Sessions.

---

## 3. Voice and Tone

Nouvelles clés de microcopy `evolution.*`, suivant le triple habillage déjà établi (une valeur par thème) :

| Clé | Grimoire Émeraude | Forêt Ancienne | Médiéval Steampunk |
|---|---|---|---|
| `evolution.levelup_banner` | "Niveau [N] disponible !" | "Le cercle t'appelle à grandir — niveau [N]" | "Calibrage niveau [N] disponible" |
| `evolution.levelup_cta` | "Level up !" | "Gravir un échelon" | "Recalibrer" |
| `evolution.xp_distribute_cta` | "Distribuer de l'XP" | "Partager les récits" | "Distribuer les crédits d'expérience" |
| `evolution.invite_slot_empty` | "Une place attend son voyageur" *(reprise identique de `ux-jdr-master-20260703`)* | *(idem)* | *(idem)* |
| `evolution.mj_edit_trace` | "modifié par le MJ" | "modifié par le MJ" | "recalibré par le MJ" |
| `evolution.note_share_toggle` | "Partager avec le groupe" | "Partager avec le cercle" | "Diffuser à l'équipage" |
| `evolution.invitation_revoked_empty` | "Aucune invitation active — envoie un nouveau corbeau pour inviter un voyageur" | *(variante forêt à définir même registre)* | *(variante steampunk à définir même registre)* |
| `evolution.landscape_section_title` *(post-final)* | "Paysage/Climat favori" | *(variante forêt à définir même registre)* | *(variante steampunk à définir même registre)* |
| `evolution.immunity_section_title` *(post-final)* | "Immunités" | *(idem)* | *(idem)* |
| `evolution.other_capabilities_title` *(update 2)* | "Autres capacités" | *(idem)* | *(idem)* |

**Règle héritée** : thème et tonalité couplés, pas de choix indépendant.

---

## 4. Component Patterns

### RosterRail / RosterStrip

Cf. DESIGN.md §7. Le slot "+ Inviter" n'apparaît que s'il reste une place libre dans la Partie ; il ouvre directement l'onglet Invitations plutôt qu'un flux séparé. Décision explicitement réversible (cf. memlog) : si l'usage montre que ce raccourci n'est pas utilisé, il peut être retiré sans impact structurel (ce n'est pas le seul point d'entrée vers Invitations).

### Distribution d'XP (XpDistributionPanel)

Ouverte depuis un bouton dédié sur la page détail de Partie (MJ uniquement, 403 sinon — FR-1). Contenu et comportement : cf. DESIGN.md §7 XpDistributionPanel. Séquence :

1. Le MJ saisit les 3 entrées de calcul assisté (difficulté du voyage, nb de souffles homme-dragon, niveau du monstre le plus fort vaincu) — FR-2.
2. Le montant suggéré s'affiche, appliqué par défaut à tous les joueurs listés (personnages actifs de la Partie).
3. Le MJ peut décocher un joueur (exclusion pour cette distribution, pas de suppression), ajuster le montant par joueur, ou ajouter un bonus individuel — FR-3.
4. Note optionnelle — FR-4.
5. Avant confirmation, un avertissement inline (non bloquant) signale si un joueur va franchir un seuil de niveau.
6. Confirmation → déclenche FR-5 (détection de seuil) pour chaque joueur concerné.

### Montée de niveau (LevelUpBanner + LevelUpWizard)

**LevelUpBanner** : dès qu'un seuil est franchi, une bannière apparaît sur la fiche du personnage concerné, persistante (reste affichée tant que non traité — cf. §5 State Patterns), avec CTA "Level up !". Complète (ne remplace pas) une notification in-app + email au moment du franchissement (cf. §8 Key Flows).

**LevelUpWizard** : au clic sur le CTA, ouvre l'assistant guidé (FR-6) :
- Si plusieurs seuils sont franchis d'un coup, les niveaux sont traités **séquentiellement** (FR-5), avec une barre de progression multi-segments.
- Chaque niveau : répartition PV/PE (3 points, contrôle stepper, FR-7) puis choix de capacité si applicable (FR-8) — grille de 4 attributs pour la capacité Attribut, avec plafond à 12 visuellement désactivé.
- **Choix à liste longue** (paysage/climat jusqu'à 22 options, classe/immunité/saison) : `capability-choice-grid` (DESIGN.md §7) — grille compacte + zone scrollable bornée en hauteur, jamais le rendu vertical non borné d'origine qui faisait déborder la popup hors écran (constaté en usage réel, post-final).
- Validation d'un niveau → instantané créé (§4.5 PRD) → niveau suivant proposé si déjà franchi, jusqu'à épuisement.

### Intégration des capacités dans la fiche (post-final)

Chaque type de capacité choisie s'affiche à l'endroit le plus pertinent de la fiche, jamais uniquement dans un journal générique :

| Capacité | Où sur la fiche |
|---|---|
| Attribut | Déjà reflété directement (la valeur d'attribut affichée dans "Attributs", **désormais premier encart de la fiche**, intègre le +2) |
| Classe (2ᵉ classe, niveau 5) | Sous-bloc dans **Vocation**, sous la classe initiale : "Classe secondaire : [Label]" + sa liste de talents (même format que la classe initiale) |
| Type (2ᵉ type, niveau 6) | Sous-bloc dans **Voie**, sous les avantages du type initial : "Type secondaire : [Label]" + ses avantages |
| Paysage/climat (niveaux 3 et 7) | Section **Paysage/Climat favori** — liste des paysages obtenus, chacun avec la mention "+2 aux tests appropriés" (référence, jamais recalculé, cf. Non-Goals PRD) |
| Immunité (niveau 4) | Section **Immunités** — liste des états obtenus |
| Protection d'un dragon (niveau 9), Voyage légendaire (niveau 10), tout type futur du même genre | **Section "Autres capacités"** (update 3) — petit encart listant chaque description ("[description]", sans le niveau — déjà visible dans Historique, cf. ci-dessous), même registre visuel que Immunités ; absente tant qu'aucune n'est obtenue |

**Historique (fusionné avec les choix, update 2)** : chaque instantané `LEVEL_UP` de la section **Historique** affiche, en plus de la date et du niveau, le choix de capacité fait à ce niveau précis (résolu depuis `snapshot.sheetData.levelUps[niveau - 2]`) — plus besoin d'un résumé séparé en bas de fiche, l'information vit à un seul endroit. Les instantanés `MJ_EDIT` n'ont pas de choix associé (champ absent pour cette ligne).

### Inventaire (EncumbranceBar + InventoryItemRow)

Section dédiée sur la fiche. `EncumbranceBar` en tête (poids total / limite, cf. DESIGN.md §7), liste d'objets en dessous. Ajout : le joueur ajoute un objet (nom + poids) pendant ou en fin de partie ; le MJ peut également ajouter un objet à tout moment (ex. objet narratif reçu hors-jeu entre deux parties) — ces objets portent un badge de provenance "ajouté par le MJ". Le MJ édite n'importe quelle ligne existante via `FieldEditPencil`.

### Notes (NotesJournal) — amende FR-11

**Forme** : journal chronologique d'entrées datées (le plus récent en premier), attaché au personnage — pas de section par séance/partie (l'entité n'existe pas), la chronologie par date suffit pour l'usage exprimé ("retrouver les notes de la session 2 en étant à la session 3").

**Visibilité, par entrée** :
- Visible par le MJ dans tous les cas (cohérent avec FR-11 initial).
- Le joueur peut en plus marquer une entrée individuelle "Partagée avec le groupe" — visible alors par tous les participants de la Partie. Statut par défaut : privé (MJ + auteur uniquement).
- Le toggle de partage est **par entrée**, jamais un réglage global de la note.

### Édition MJ (FieldEditPencil)

Un crayon par propriété individuelle (stats, capacités, objets d'inventaire, champs narratifs) plutôt qu'un mode "édition" global de la fiche — réduit le risque d'erreur en édition libre (FR-14). Chaque édition confirmée crée un instantané marqué "modifié par le MJ" (`evolution.mj_edit_trace`), consultable dans l'Historique. Éditer le champ XP via ce mécanisme redéclenche le flux guidé de montée de niveau (FR-5/FR-6) — les autres champs restent libres, sans validation de cohérence de règles (avertissement non bloquant si une valeur sort du catalogue connu, jamais de rejet).

---

## 5. State Patterns

| État | Comportement |
|---|---|
| Niveau franchi, non traité | `LevelUpBanner` visible sur la fiche, persistante, aucune modale forcée |
| Distribution d'XP sur le point de faire franchir un seuil | Avertissement inline dans `XpDistributionPanel`, jamais bloquant |
| Attribut à 12, autre choix disponible | Case `attribute-choice-grid` désactivée (opacity réduite), non cliquable |
| Les 4 attributs à 12 (cas extrême) | Le système plafonne silencieusement ; le MJ garde la main via `FieldEditPencil` s'il veut aller au-delà |
| Invitation révoquée | Le lien disparaît totalement de l'onglet Invitations — jamais affiché grisé ou barré, pour éviter tout clic accidentel |
| Aucune invitation active | Empty state thématisé (`evolution.invitation_revoked_empty` ou équivalent "aucune invitation") |
| Place libre dans la Partie | Slot "+ Inviter" visible en dernier item du RosterRail/RosterStrip |
| Toutes les places pourvues | Slot "+ Inviter" absent (pas grisé — retiré) |
| Objet d'inventaire ajouté par le MJ | Badge de provenance visible en permanence sur la ligne, pas seulement au moment de l'ajout |
| Entrée de note privée / partagée | Icône verrou fermé/ouvert, jamais la couleur seule comme vecteur (cf. Accessibility Floor hérité) |
| Édition MJ confirmée | Instantané créé immédiatement, visible dans l'Historique avec le marqueur "modifié par le MJ" |
| Encombrement dépassé (FR-10) | `EncumbranceBar` passe en dégradé rouge/ambre + label "Surchargé" à côté du poids — jamais bloquant, juste un signal visuel renforcé (texte, pas seulement la couleur) |
| Historique XP vide (aucune distribution encore faite sur cette Partie) | Empty state thématisé (`evolution.xp_history_empty`, à définir par thème sur le modèle de `evolution.invitation_revoked_empty`) plutôt qu'une liste vide sans explication |
| Journal de notes vide (personnage sans aucune entrée) | Empty state thématisé (`evolution.notes_journal_empty`, même registre), avec le CTA "+ Ajouter une entrée" déjà visible pour inviter à la première écriture |
| Aucun paysage/climat encore obtenu (avant niveau 3) | Section "Paysage/Climat favori" absente, pas un empty state — cohérent avec Équipement/Notes narratives qui n'affichent pas non plus de section vide pour un champ jamais renseigné |
| Aucune immunité encore obtenue (avant niveau 4) | Section "Immunités" absente, même logique |
| Aucune capacité "Autres" encore obtenue (update 2) | Section "Autres capacités" absente, même logique |
| Choix de capacité à liste longue (`capability-choice-grid`, ex. 22 paysages/climats) | Grille scrollable bornée en hauteur — jamais de débordement hors écran, quel que soit le nombre d'options |
| Instantané `LEVEL_UP` dans Historique (update 2) | Affiche systématiquement le choix de capacité fait à ce niveau, en plus de la date/niveau |
| Instantané `MJ_EDIT` dans Historique | Aucun choix de capacité associé — champ simplement absent pour cette ligne, pas de placeholder vide |

---

## 6. Interaction Primitives

Hérite du socle existant. Nouveauté : le `pv-pe-stepper` (LevelUpWizard) est un contrôle +/- à bouton rond, pas de slider ni de geste — cohérent avec la contrainte "somme exactement 3 points" qui bénéficie d'incréments discrets plutôt que d'un contrôle continu. Le déploiement du `RosterRail` (replié ↔ déplié) est un clic, pas un hover (cf. DESIGN.md §4 — évite les ouvertures accidentelles).

---

## 7. Accessibility Floor

Hérite intégralement le socle de `ux-jdr-master-20260626/EXPERIENCE.md` §7 (touch targets 44px mobile/36px desktop, contraste 4.5:1/3:1, couleur jamais seul vecteur d'information, dark mode strict, pattern aria-label `"[Nom] : [état]"`).

**Ajouts spécifiques à ce delta :**
- `FieldEditPencil` : `aria-label="Modifier [nom du champ]"`, jamais une icône seule sans label accessible.
- `LevelUpBanner` : `aria-live="polite"` sur son apparition (le joueur doit être notifié même hors focus visuel direct, sans interrompre une tâche en cours comme le ferait une alerte assertive).
- `EncumbranceBar` : la valeur numérique (poids/limite) est toujours affichée en texte, jamais uniquement la barre visuelle — cohérent avec "couleur jamais seul vecteur d'info" pour l'état de dépassement.
- Statut privé/partagé d'une entrée de note : icône + texte (`aria-label="Entrée privée"` / `"Entrée partagée avec le groupe"`), jamais l'icône seule.
- Item `RosterRail` replié (icône seule, 64px) : `aria-label="[Nom] — [Personnage], niveau [N]"` (ou `"[Nom] — MJ"`) complet même à l'état compact, puisque le nom n'est pas visible textuellement dans cet état. Le statut MJ est en plus signalé visuellement par un badge texte "MJ" en plus de l'anneau de couleur (cf. DESIGN.md §7) — la couleur seule ne suffit jamais à distinguer le MJ des joueurs.
- `RosterStrip` (mobile) : même pattern d'aria-label que `RosterRail`, appliqué à chaque pastille de la rangée horizontale — le problème "icône seule, nom non visible" est identique en orientation horizontale.
- Slot "+ Inviter" (RosterRail et RosterStrip) : `aria-label="Inviter un participant"`.
- `pv-pe-stepper` : `aria-label="Diminuer PV"` / `"Augmenter PV"` / `"Diminuer PE"` / `"Augmenter PE"` sur chacun des 4 boutons — jamais un bouton rond icône-seule sans label distinct par colonne.
- `attribute-choice-grid` : étend le pattern hérité `"[Nom] : [état]"` — `aria-label="[Attribut] : [valeur actuelle]"`, `"[Attribut] : [valeur] → [valeur+2], sélectionné"` si sélectionné, `"[Attribut] : déjà au maximum (12)"` si désactivé (accompagné d'un `aria-describedby` pointant vers le texte d'explication, pas seulement l'opacité réduite).
- `capability-choice-grid` (post-final) : zone scrollable navigable au clavier (`tabindex` naturel des cellules, pas de piège de focus) ; le scroll interne ne doit jamais masquer l'item actuellement focus (scroll-into-view automatique au focus clavier).
- Toute cible tactile visuellement sous 44px mobile / 36px desktop (`pv-pe-stepper`, `RosterStrip` items, slot "+ Inviter") conserve une **zone de tap étendue** par padding invisible jusqu'au seuil requis — la taille visuelle du glyphe peut rester compacte, la zone cliquable ne descend jamais sous le plancher hérité.

---

## 8. Key Flows

**Mockups de référence** (`mockups/`) : [layout-options-partie-detail.html](mockups/layout-options-partie-detail.html) (exploration layout retenue : panneau gauche), [layout-alternatives-mobile.html](mockups/layout-alternatives-mobile.html) (rail compact repliable retenu + IA mobile par rôle), [key-flows-xp-levelup-inventory.html](mockups/key-flows-xp-levelup-inventory.html) (distribution XP, montée de niveau, inventaire). Personnage d'exemple : Fenn (Ménestrel, Technique, Niveau 1, VIG8/AGI4/INT6/ESP6, PV16/PE12) — même personnage que les mocks hérités de `ux-jdr-master-20260703`.

**UJ-1. Sylas (MJ) distribue de l'XP après une session bien remplie.**

Sylas vient de terminer une session avec son groupe (Alice/Fenn, Bob/Rok). Depuis la page détail de "Les Brumes d'Aubval", il clique sur "Distribuer de l'XP". Le panneau s'ouvre : il saisit la difficulté max du voyage (8–10 → 200 XP suggérés), 0 souffle utilisé, un monstre de niveau 5 vaincu (+50 XP) — le montant suggéré affiche 250 XP, appliqué à Alice et Bob. Il se souvient que Bob a désamorcé seul le piège du pont : il clique "+ bonus" sur la ligne de Bob, ajoute 50 XP, écrit une note ("Bob a désamorcé le piège du pont tout seul"). Avant de confirmer, il voit l'avertissement : "Alice franchira le niveau 2". **Climax** : il confirme — Alice et Bob voient chacun leur XP mis à jour, Alice voit apparaître sa bannière "Level up !". **Résolution** : Sylas retrouve cette distribution plus tard dans la section Historique XP de la page Partie, avec la note et la répartition.

**UJ-2. Alice (joueuse) traite sa montée de niveau, plus tard dans la semaine.**

Le soir même, Alice n'a pas le temps de s'en occuper — elle ferme l'app, la bannière "Niveau 2 disponible !" reste affichée sur la fiche de Fenn. Deux jours après, elle rouvre l'app sur son téléphone, va sur "Ma fiche" (onglet par défaut côté joueur), voit la bannière toujours là, tape "Level up !". L'assistant s'ouvre : elle répartit les 3 points (2 en PV, 1 en PE — les boutons +/- l'empêchent de dépasser 3 au total), puis choisit la capacité Attribut débloquée au niveau 2 : elle sélectionne VIG (8 → 10). **Climax** : elle valide, la fiche de Fenn se met à jour immédiatement (PV 18, PE 13, VIG 10), un instantané est créé. **Résolution** : la bannière disparaît, remplacée par les nouvelles stats visibles directement sur la fiche.

**UJ-3. Sylas (MJ) corrige une information saisie de travers à la création.**

En relisant la fiche de Bob, Sylas remarque que Rok a été créé avec la mauvaise catégorie d'arme (Lance au lieu de Hallebarde, une erreur de l'assistant de création). Plutôt que de faire recommencer Bob dans l'assistant, il clique sur le `FieldEditPencil` à côté du champ arme, corrige la valeur, confirme. **Climax** : le champ est mis à jour immédiatement sur la fiche de Rok, sans repasser par l'assistant de création. **Résolution** : un instantané "modifié par le MJ" est créé, consultable dans l'historique de Rok — Bob peut voir que ce champ précis a été corrigé et par qui, sans ambiguïté sur le reste de sa fiche.

*Variante du même mécanisme* : Sylas utilise aussi `FieldEditPencil` pour ajouter un objet narratif à l'inventaire d'un personnage entre deux sessions (ex. une lettre scellée reçue hors-jeu) — même traçabilité ("modifié par le MJ"), cf. Component Patterns §4 "Inventaire".

**UJ-4. Bob ajoute un objet ramassé en jeu à l'inventaire de Rok.**

Pendant la session, Rok trouve une cape de voyage abandonnée. Bob ouvre l'onglet Inventaire de sa fiche, tape "+ Ajouter un objet", saisit "Cape de voyage" et son poids (1,2 kg), valide. **Climax** : l'objet apparaît dans la liste, et l'`EncumbranceBar` se met à jour immédiatement — le total passe de 7,5 à 8,7 sur une limite de 9, visiblement proche de la limite (dégradé qui commence à basculer vers l'état d'alerte). **Résolution** : Bob voit tout de suite qu'il approche de sa limite d'encombrement et peut décider de laisser tomber un objet moins utile avant la prochaine étape du voyage — rien n'est bloqué, juste rendu visible.

---

## 9. Responsive & Platform

Hérite des breakpoints du spine (`{spacing.bp-mobile}` 480px, `{spacing.bp-tablet}` 768px, `{spacing.bp-desktop}` 1024px). Le seuil pertinent pour le `RosterRail` est 1024px (cohérent avec le seuil du `WizardLayout` hérité) — en dessous, la page détail de Partie bascule sur les patterns mobiles décrits en §2 (RosterStrip MJ / nav réduite joueur), pas de RosterRail intermédiaire à des largeurs de tablette.
