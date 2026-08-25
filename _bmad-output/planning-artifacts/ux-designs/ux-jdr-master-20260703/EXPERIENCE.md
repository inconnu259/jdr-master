---
title: jdr-master Experience Spec — Delta Ryuutama (Palier P3)
status: final
updated: 2026-07-03
design_ref: DESIGN.md
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/EXPERIENCE.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260703/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260703/addendum.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/EXPERIENCE.md"
  - "_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-06-27/ARCHITECTURE-SPINE.md"
---

# jdr-master — Experience Specification — Delta Ryuutama (création & fiche de personnage)

Palier P3 : Moteur plugin GameSystem + premier système jouable (Ryuutama). **Delta** sur `ux-jdr-master-20260626/EXPERIENCE.md` — hérite l'IA globale, la voix par thème, le socle d'accessibilité et les patterns de composants existants ; ce document capture uniquement ce qui est *nouveau*. Tokens visuels : `DESIGN.md` (ce dossier), lui-même un delta sur le spine hérité.

En cas de conflit avec un mock (`.working/key-*.html`), **ce document et DESIGN.md gagnent**.

---

## 1. Foundation

**Form-factor** : mobile + desktop, comme le reste de l'app. La création de personnage est utilisable sur les deux (contrairement à certaines vues MJ existantes plutôt desktop-first), car un joueur peut vouloir créer son personnage avant une séance, en mobilité.

**UI system** : Angular Material 22, standalone components, signals — identique au reste de l'app (cf. `ARCHITECTURE-SPINE.md`).

**Rendu piloté par schéma** : conformément à `docs/spec.md` §5 et au PRD P3 (F1.3), l'assistant de création et la fiche sont rendus par un moteur générique consommant `sheetSchema()`/`creationSteps()` du plugin `GameSystemPlugin` Ryuutama — ce document décrit le comportement *observable*, pas l'implémentation du moteur de rendu lui-même (hors scope UX, cf. architecture).

---

## 2. Information Architecture

**Nouvelle branche** (absente du spine hérité, qui ne couvrait que Calendrier/Vote) :

```
App
├── ... (inchangé : Dashboard, Mon calendrier, etc.)
└── Mes parties
    └── [Partie]
        ├── Détail partie (inchangé)
        ├── Calendrier (inchangé)
        ├── Vote (inchangé)
        └── Personnages (NOUVEAU)
            ├── Liste des personnages de la partie (CharacterSummaryCard par personnage créé)
            ├── Créer un personnage → Assistant de création (wizard plein écran, 8 étapes)
            └── [Personnage] → Fiche en lecture seule
                └── Modifier le portrait (action, cf. §4 Portrait)
```

**Décision actée** : pas de nouvelle entrée dans la toolbar globale (rejeté — cf. memlog, une exploration antérieure `desktop-mj.html` avait esquissé une nav horizontale globale "Personnages"/"Systèmes" jamais implémentée). L'onglet "Personnages" s'ajoute aux onglets existants de la page détail de partie, cohérent avec le principe "tout ce qui touche une partie vit sous `/parties/:id`".

**Accès MJ** : le MJ voit la même liste, avec accès en lecture à la fiche de n'importe quel personnage de ses joueurs sur cette partie (FR-4.3 du PRD) — pas d'onglet séparé, même surface, permission différente (pas d'action "Créer" pour un personnage d'un autre joueur).

---

## 3. Voice and Tone

Nouvelles clés de microcopy `character.*`, à créer dans `ThemeToneService` en suivant le triple habillage déjà établi (une valeur par thème, mêmes clés) :

| Clé | Grimoire Émeraude | Forêt Ancienne | Médiéval Steampunk |
|---|---|---|---|
| `character.create_cta` | "Créer un voyageur" | "Éveiller un compagnon de route" | "Assembler un automate-voyageur" |
| `character.tab_label` | "Personnages" | "Personnages" | "Personnages" *(neutre, pas de thématisation nécessaire pour un libellé d'onglet)* |
| `character.step_class` | "Choisir sa vocation" | "Choisir son rôle dans le cercle" | "Choisir sa fonction" |
| `character.step_type` | "Choisir sa voie" | "Choisir son chemin" | "Choisir son mécanisme" |
| `character.magic_deferred_notice` | "La magie s'apprendra plus tard, jeune sorcier — pour l'instant, seuls les dons passifs s'activent." | "Les sortilèges des saisons dorment encore — reviens quand le cercle sera prêt." | "Le grimoire à vapeur n'est pas encore calibré pour les formules — les avantages de base restent actifs." |
| `character.portrait_missing` | "Aucun portrait — le conteur imagine un visage" | "Aucun visage gravé — la forêt garde son mystère" | "Aucun portrait gravé sur la plaque" |
| `character.portrait_edit_cta` | "Modifier le portrait" | "Modifier le portrait" | "Recalibrer le portrait" |

**Règle héritée (spine 20260626 §3)** : le thème et la tonalité restent couplés — pas de choix indépendant. `character.magic_deferred_notice` est **obligatoire** dès que le type Magie est sélectionné (cf. PRD FR-3.2, Non-Goal notifié à l'utilisateur) — ne jamais laisser le joueur choisir Magie sans ce message.

---

## 4. Component Patterns

### Assistant de création (WizardLayout, cf. DESIGN.md §7)

**Desktop (≥1024px)** — Option retenue après comparaison de 3 directions (cf. memlog) : zone principale 65% (étape courante) + panneau latéral 35% (résumé de fiche en construction, style `SlotPanel`). Le panneau latéral se met à jour **en temps réel** à chaque changement d'attribut (FR-3.4 du PRD, `computeDerived()` côté client, sans appel réseau) — PV/PE/Condition/Initiative/Encombrement affichés en badges dès que les attributs sont assignés, avant même la validation finale.

**Mobile (<768px)** — Une étape par écran, pas de panneau résumé permanent (place insuffisante). Barre de progression avec libellé textuel de l'étape courante (pas de points abstraits — décision actée après clarification utilisateur sur la différence perçue entre deux options quasi identiques). Navigation via barre inférieure fixe Précédent/Suivant.

**Les 8 étapes** (ordre fixe, cf. PRD F3 / addendum §1) : Classe → Type → Attributs → Arme favorite → Objet fétiche → Équipement (auto, pique-nique) → Champs narratifs → *(optionnel, skippable)* Portrait.

**Étape Artisan (cas particulier)** : si la classe "Artisan" est choisie, l'étape Classe elle-même se prolonge d'un sous-choix obligatoire (type d'objet de spécialité) avant de pouvoir avancer — pas une étape séparée dans la barre de progression, un état "étendu" de l'étape Classe.

### Choix (ChoiceCard, réutilise PollOption)

Chaque étape à choix unique (classe/type/arme) présente une grille de `ChoiceCard`. Sélectionner une carte affiche immédiatement le détail informatif associé (talents de la classe, avantages du type) **sans navigation** — pas de clic supplémentaire pour "voir plus".

### Répartition des attributs

Contrôle de type "chips assignables" (cf. mock `key-creation-desktop.html`/`key-creation-mobile.html`) : les valeurs du pattern choisi (ex. Polyvalent {8,4,6,6}) sont présentées comme des jetons à assigner un par un aux 4 attributs (AGI/ESP/INT/VIG). Un jeton déjà assigné ne peut pas être réassigné ailleurs sans d'abord libérer son emplacement (contrainte du multi-ensemble fixe, cf. PRD FR-3.3).

### Portrait (Avatar + PortraitPanel, cf. DESIGN.md §7)

- **Ajout pendant la création** : étape 8, clairement libellée optionnelle ("Passer cette étape" toujours visible à côté du contrôle d'upload).
- **Ajout/modification après création** : lien "Modifier le portrait" (ou variante thématisée, cf. §3) sur la fiche, à tout moment.
- **Outil de recadrage** : après sélection d'un fichier image, un contrôle de recadrage circulaire (zoom + repositionnement par glisser) permet de centrer le visage avant validation. *(Spine-only à ce stade — pas de mock visuel pour l'outil lui-même, cf. décision utilisateur de valider en conditions réelles une fois l'app fonctionnelle.)*
- **Résultat** : l'image recadrée alimente l'Avatar (rond) ; l'image source complète (non recadrée) alimente le `PortraitPanel` sur la fiche.

---

## 5. State Patterns

| État | Comportement |
|---|---|
| Étape avec sous-choix obligatoire non fait (ex. Artisan sans spécialité, Magie sans le message de notice affiché) | Bouton "Suivant" désactivé, message inline expliquant ce qui manque |
| Validation finale échouée (`validate(data, "strict")`) | Retour à l'étape en erreur (pas un écran d'erreur générique), liste des erreurs contextualisées à l'étape concernée |
| Personnage créé avec succès | Redirection automatique vers la fiche (pas vers la liste) — le joueur voit immédiatement le résultat de ses choix |
| Portrait absent | Avatar = initiales (jamais un cercle vide ou une icône générique "pas d'image") ; `PortraitPanel` absent de la fiche (pas de placeholder vide) |
| Portrait présent | Avatar = image recadrée ; `PortraitPanel` présent avec l'image complète |
| Type Magie sélectionné | `character.magic_deferred_notice` affiché immédiatement après la sélection, avant de pouvoir continuer |

---

## 6. Interaction Primitives

Hérite du socle existant (spine 20260626 §6) : transitions slide pour panels (`{motion.duration.short/medium}`), pas de nouvelle primitive d'interaction introduite par ce delta à l'exception du contrôle "chip assignable" (§4), qui reste un drag-or-tap standard (pas de geste custom).

---

## 7. Accessibility Floor

Hérite intégralement le socle de `ux-jdr-master-20260626/EXPERIENCE.md` §7 (touch targets 44px mobile/36px desktop, contraste 4.5:1/3:1, couleur jamais seul vecteur d'information, dark mode strict, pattern aria-label `"[Nom] : [état]"`).

**Ajouts spécifiques à ce delta :**
- Chaque `ChoiceCard` a un aria-label complet (`"[Nom de la classe] : [talents résumés]"`), pas juste le nom.
- La barre de progression du wizard annonce le changement d'étape aux lecteurs d'écran (`aria-live="polite"` sur le libellé d'étape).
- L'avatar sans portrait n'est jamais annoncé comme une image manquante/cassée — `alt`/aria-label = `"Portrait de [Nom] (aucune image)"` explicite plutôt qu'un état d'erreur.
- Le contrôle de recadrage (quand implémenté) devra offrir une alternative clavier au glisser-déposer — **note pour l'implémentation**, non résolue ici (spine-only).

---

## 8. Key Flows

**Mockups de référence** (`mockups/`) : [key-personnages-tab.html](mockups/key-personnages-tab.html) (onglet Personnages), [key-creation-desktop.html](mockups/key-creation-desktop.html) / [key-creation-mobile.html](mockups/key-creation-mobile.html) (assistant, étape 3/8 Attributs), [key-fiche-desktop.html](mockups/key-fiche-desktop.html) (fiche finale). Personnage d'exemple dans tous les mocks : Fenn (Ménestrel, Technique, VIG8/AGI4/INT6/ESP6, Lance).

**UJ-1. Fenn crée son personnage avant la première séance.**

Fenn (joueur, sur mobile, dans son canapé la veille de la première séance) ouvre l'app, va sur sa partie, tape l'onglet "Personnages" — vide pour l'instant, un bouton "Créer un voyageur" bien visible. Il tape dessus : l'assistant s'ouvre en plein écran, étape 1/8 "Choisir sa vocation". Il parcourt les 7 classes en grille, tape sur "Ménestrel" — la carte se sélectionne, les 3 talents (Légendes, Mélodies, Voyages) s'affichent en dessous immédiatement, sans changer d'écran. Il avance étape par étape : type "Technique" (avantages passifs affichés), attributs (assigne le pattern Polyvalent en glissant les jetons 8/6/6/4 sur VIG/AGI/INT/ESP — la barre de progression indique "Étape 3/8 · Attributs"), arme favorite "Lance", objet fétiche ("une plume de corbeau porte-bonheur"), équipement (auto, rien à faire), champs narratifs (village natal "Aubval", motivation "voir la mer pour la première fois"). À l'étape 8 (Portrait, optionnelle), il tape "Passer cette étape" — pas encore d'image sous la main. Il valide : la fiche de Fenn s'affiche immédiatement, avatar aux initiales "FE", PV 16 / PE 12 / Initiative 10 calculés automatiquement. **Climax** : Fenn voit sa fiche complète, cohérente, sans avoir eu à faire un seul calcul lui-même. **Résolution** : le lendemain, à la table, il retrouve son personnage en un tap depuis l'onglet Personnages de la partie.

*Edge case* : s'il avait choisi la classe Artisan, l'étape 1 se serait prolongée d'un sous-choix obligatoire (type d'objet de spécialité) avant de pouvoir passer à l'étape 2.

**UJ-2. Fenn ajoute son portrait deux semaines plus tard.**

Après la 3e séance, Fenn a trouvé une illustration qui lui plaît. Il rouvre sa fiche depuis l'onglet Personnages, tape "Modifier le portrait" à côté de son avatar aux initiales. Il choisit l'image depuis sa galerie, l'outil de recadrage s'ouvre : il zoome et repositionne pour que le visage du personnage soit bien centré dans le cercle, valide. **Climax** : son avatar passe des initiales "FE" à son portrait ; la fiche affiche désormais aussi le portrait complet non recadré dans un cadre dédié en haut de la fiche. **Résolution** : le MJ, qui consulte la fiche de Fenn en lecture seule, voit le même portrait.

---

## 9. Responsive & Platform

Hérite des breakpoints du spine (`{spacing.bp-mobile}` 480px, `{spacing.bp-tablet}` 768px, `{spacing.bp-desktop}` 1024px — le seuil pertinent pour le wizard est 1024px, pas 768px, car le panneau latéral résumé a besoin de plus de largeur que le split calendrier existant, cf. DESIGN.md §4).

**Fiche personnage** : desktop/tablette = disposition à 2 colonnes fidèle à la fiche papier officielle Ryuutama ; mobile = mêmes informations réorganisées en sections empilables/accordéon (pas de décalque littéral du papier — décision actée, cf. memlog). *(Spine-only pour la version mobile de la fiche — pas de mock visuel produit à ce stade.)*
