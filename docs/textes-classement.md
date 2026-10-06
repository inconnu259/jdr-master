# Classement des textes : thématisés ou non

Document produit par la story 35.2. Il dit, pour toute l'application web (`apps/web`), quels textes
relèvent d'un **thème** (lus depuis le registre `apps/web/src/app/core/theme/tones/*.ts`) et lesquels
sont **hors thème** (restent en dur, où ils sont).

**Comment l'utiliser.**
- Tout texte ajouté à l'application doit être classé avec la règle de la section 2 avant d'être écrit.
- Si le classement n'est pas évident, demander plutôt que trancher seul.
- Les formulations sont pour l'instant **identiques dans les trois thèmes** : la 35.2 déplace les
  textes, la story 35.3 réécrit les voix. Ce document délimite donc le périmètre de la revue éditoriale 35.3.

## 1. Pourquoi

Avant la 35.2, les textes étaient répartis entre le registre de thème et plusieurs centaines
d'occurrences codées en dur, sans règle écrite. La revue éditoriale n'avait pas de périmètre net.

## 2. La règle

**Relève d'un thème** : le ton de l'application.
- boutons et actions ;
- titres d'écran (y compris titres de route) ;
- états vides et états de chargement ;
- confirmations ;
- messages d'erreur et de succès ;
- liens de navigation ;
- textes d'aide à l'utilisation (placeholders d'exemple, consignes).

**Hors thème** (reste en dur, jamais au registre) :
- contenu et vocabulaire d'un système de jeu (Ryuutama) : libellés de fiche, races, règles, aides à la
  création de personnage, catalogues ;
- noms propres et marque (« Dés Dispos », noms des thèmes, « Homme Dragon ») ;
- vocabulaire de domaine : créneaux « Matin », « Après-midi », « Soir », « Journée » ;
- unités (« Po », « XP », « h », « o ») et dates (formats `Intl`, `date` pipe) ;
- libellés purement techniques jamais affichés ou non lisibles (ligatures d'icônes Material, glyphes,
  valeurs d'enum et d'API, noms de fichiers d'export, classes CSS) ;
- contenu saisi par l'utilisateur ou fourni par le serveur (noms, descriptions, messages d'API,
  libellés de catalogue).

**`aria-label` et `title`** suivent leur texte visible : thème si le texte visible l'est, hors thème sinon.
Un libellé purement technique est hors thème.

## 3. Conventions du registre

- Une clé est préfixée par sa fonctionnalité (`auth.*`, `calendar.*`, `scenarios.*`, `hd.*`, `parties.*`,
  `pollui.*`, `characters_sheet.*`, `characters_wizard.*`, `portrait.*`, `shell.*`, `route.*`, `core.*`,
  `shared.*`…).
- Une formulation qui se répète à l'identique (« Annuler », « Retour à la connexion »…) partage **une seule**
  clé `common.*`, pas une clé par écran.
- Les clés à `{trous}` sont remplies par `fillTone` (`apps/web/src/app/core/theme/tone-format.ts`). Un
  autre usage d'une clé commune à trous doit reprendre les mêmes noms de trous.
- Les fonctions pures sans injection ne lisent pas le registre elles-mêmes : elles renvoient une clé, ou
  reçoivent le registre en paramètre (`tone`, optionnel, défaut `TONE_MAP['grimoire-emeraude']`).
- **Clés construites dynamiquement : ne jamais les supprimer** (une recherche de la clé complète ne les
  trouve pas) :
  `account.calendar_intent.*`, `account.calendar_layer.*`, `character.equipment_group_*`,
  `character.equipment_qty_*`, `dashboard.sort_*`, `my_characters.sort_*`, `list_control_bar.view_mode_*_aria`,
  `partie.signal_*`, `partie.kind_*`.
- Ajout d'une clé : d'abord dans `grimoire-emeraude.ts` (type de référence), puis dans
  `foret-ancienne.ts` et `atelier-cuivre.ts`. Une clé absente d'un thème fait échouer `pnpm build` et le
  test de parité de `theme-tone.service.spec.ts`.

## 4. Statut par fonctionnalité

Dans chaque ligne, « thématisé » signifie : tous les textes relevant de la règle lisent le registre. La
colonne de droite liste les **familles** gardées hors thème, avec la raison.

| Fonctionnalité | Thématisé | Familles hors thème (raison) |
|---|---|---|
| `auth` (login, register, forgot/reset-password, confirm/rollback-email-change), `join`, titres de `app.routes.ts` | Oui. Titres de route via `ResolveFn` (`toneTitle`) ; répétitions en `common.*` | Marque « Dés Dispos » et décor SVG de `auth-band` (nom propre) ; motif `pv.reason` renvoyé par l'API (serveur, seul le repli est thématisé) |
| `account`, `dashboard`, `announcements`, `layout/shell` | Oui (clés `account.*`, `dashboard.*`, `shell.*`, `common.accepter`/`refuser`…) | Noms des thèmes (noms propres) ; créneaux `SLOT_LABELS` (domaine) ; noms de systèmes et types de partie (`gameSystemName`) ; dates ; glyphe `✎`, ligatures d'icônes, enums (technique) ; contenu saisi (pseudo, annonce) |
| `characters` : fiche (`character-sheet`, `my-characters`, `character-summary-card`) | Oui pour le chrome : chargement, erreurs, aria des crayons d'édition (préfixe « Modifier {label} »), historique, inventaire (CTA, états vides, placeholders), montée de niveau | Libellés de fiche Ryuutama (attributs, PV/PE, sections, méta « classe · voie · Niveau n »), catégories d'équipement Objets/Contenants/Animaux, descriptions de capacités (`capability-label.util.ts`), catalogues (règles du jeu) ; noms de champs passés aux crayons (libellés de fiche) |
| `characters` : création (`character-wizard`, `portrait-*`, `character-avatar`) | Oui pour le chrome : navigation d'étapes, chargement, erreurs, avertissement portrait, bascule d'équipement, aria des groupes, recadrage de portrait | Champs narratifs, fétiche, magie, attributs, sous-titres de classe, saisie d'arme libre, lignes du récapitulatif, « Po » (aides à la création et fiche Ryuutama) ; contenu de catalogue |
| `homme-dragon` | Oui pour le chrome seulement : export PDF, confirmations, états vides, erreurs, progression d'étapes, navigation, aventures, boutons et aria de la réserve | Races et teintes, intitulés et champs de fiche, règles et consignes de jeu, familles de souffles, catégories de la fenêtre de choix, vocabulaire de la réserve, étapes et champs de création, « N PS » ; nom propre « Homme Dragon » (titre de page) ; contenu de catalogue |
| `calendar` | Oui : vues (mois, semaine, agenda, rail), barre de composition, dialogues (composition, conflit, scellage), panneau de contraintes, aria de navigation, états d'état en mots (`util_*`, `week_status_*`) | Créneaux (domaine) ; noms de jours et de mois, dates `Intl` ; séparateurs et connecteurs de composition (` · `, ` — `, ` ou `) ; glyphes et icônes ; enums d'API ; compteurs `n / total` ; libellés fournis par l'appelant ; code mort `recurLabel` |
| `poll` | Oui (`pollui.*`, `common.oui`/`non`/`peut_etre`) | Créneaux ; emojis de réponse ; dates ; valeurs d'API YES/NO/MAYBE affichées sur les boutons de vote (voir section 5) |
| `parties` | Oui : confirmation, verrous de visibilité, détail de partie (onglets, lien d'invitation), rail d'effectif, panneau et historique d'XP | Créneaux ; règles de calcul d'XP et champs de calcul Ryuutama (rappel de règles) ; unité « XP » ; onglet « Homme Dragon » (nom propre) ; dates ; contenu serveur |
| `scenarios` | Oui : éditeur, formulaire, liste, chronologie, dialogue de lecture, liste des séances (boutons, aria, placeholders d'exemple, erreurs, confirmations) | Créneaux ; durées « N h · M séances » et taille « o » (unités) ; placeholders `min`/`max` ; dates ; glyphes 🔓/🔒 ; titres, descriptions et messages d'API (utilisateur/serveur). Aucun contenu Ryuutama dans cette zone |
| `shared/*` | Oui : `detail-surface` (`shared.*`, `common.detail`) ; le reste était déjà au registre (`identity`, `list-control-bar`, `password-reveal`, `status-badge`) | Marque (`shared/brand`, SVG) ; décoratifs `party-banner`/`party-countdown` ; décompte calculé du `status-badge` ; « Homme Dragon » de repli de `nature-marker` (nom propre) |
| `core/*` | Oui : types de partie (`core.parties_kind_*`, via `partieKindLabelKey()` qui renvoie une clé) ; état vide des aventures (`core.homme_dragon_sans_aventure`, paramètre `emptyLabel`) | `APP_TITLE` « Dés Dispos » (marque) ; dates relatives de `status-badge.model.ts` ; noms de repli « Personnage sans nom » / « Homme Dragon sans nom » ; messages techniques jamais affichés (`realtime`, `availability`) ; fixtures de test |

## 5. Décisions ambiguës à réexaminer en 35.3

**Hors thème par choix, mais discutable**
- Dates relatives (`imminenceLabel()`, `SLOT_WHEN` : « ce soir », « demain », « dans 5 j »…) : classées
  format de date, hors thème. Migrer imposerait de changer la signature et le contrat
  `StatusBadgeState.text`, et des specs assertent le texte. À rouvrir si l'on veut une voix par thème.
- « Personnage sans nom » / « Homme Dragon sans nom » : textes de repli affichés, mais aussi clés de tri et
  de recherche (~10 appelants purs). Les thématiser ferait dépendre tri et filtre du thème.
- ` (+1 autre)` de `buildDayDetail` (`day-detail.utils.ts`) : classé compteur technique, laissé en dur ;
  le thématiser exigerait de passer `tone` à la fonction.
- Durées « N h · M séances » (`scenarios`) : classées unités bien que « séances » soit du vocabulaire.
- « Occupations » / « Actions » (sous-titres de classe, wizard) : vocabulaire Ryuutama alors que « Talents »
  est déjà au registre (`character.choice_talents_label`) ; homogénéité à revoir.
- Connecteur ` ou ` des créneaux d'un vote et séparateurs de composition : laissés en dur.
- Valeurs d'API YES / NO / MAYBE affichées telles quelles sur les boutons de vote de `poll-response.html`
  (comportement inchangé, à signaler à la revue).

**Migrés, mais avec un point d'attention**
- `participationAriaLabel`, `answerLabel`, `groupAriaLabel`, `memberStatusWord` et `buildWeek()` reçoivent un
  paramètre optionnel `tone` (défaut : thème de référence). Les appelants des composants de `calendar` passent
  `theme.tone()` ; à vérifier avant 35.3 que **tous** les appelants le font, sinon ces textes restent sur le
  thème de référence.
- « Niveau {n} » : hors thème dans la méta de fiche, migré dans l'historique et le titre de la montée de niveau.
- « Calcul assisté » (titre de `rules-reminder`) : thème ; le corps du rappel (règles) : hors thème.
- « Email » (formulaires) et « e-mail » (phrases) : orthographe laissée telle quelle.
- Replis défensifs `?? '{partie}'` et `?? 'Voir les {n} autres'` de `character-creation-entries.ts` : non
  migrés (valeurs de repli d'une clé existante).

**Doublons de formulation gardés sous des clés distinctes, volontairement**
- `parties.detail_tab_scenarios` et `scenarios.list_title` ; `parties.detail_tab_timeline` et
  `scenarios.timeline_title` : même texte, contextes différents, non fusionnés.
- Les autres doublons (messages « Impossible de charger les scénarios. » et « Impossible de clôturer le
  vote. », mots d'état `disponible` / `indisponible`, déclarations « Récurrent » / « Ponctuel », « Aucune
  description disponible. ») ont été **fusionnés** en une clé : `common.impossible_de_charger_les_scenarios_reessayez`,
  `common.impossible_de_cloturer_le_vote_reessayez`, `common.aucune_description_disponible`,
  `calendar.week_status_*` et `calendar.week_decl_*`. Ces deux dernières familles servent aussi à la vue Mois, aux
  utilitaires de groupe et à la vue calendrier : le préfixe `week_` ne dit plus où elles sont lues.
- `core.parties_kind_*` (« One-shot », « Campagne », « Campagne épisodique ») et `partie.kind_*` (« Quête
  unique », « Chronique »…) : textes différents pour la même notion ; la 35.3 décidera de les fusionner.
- Mots d'état en minuscules (`calendar.week_status_*`, `calendar.month_*`) séparés des formes capitalisées
  `common.disponible` / `common.indisponible` pour éviter une collision de slug.
- La boîte de conflit du calendrier réutilise `calendar.week_status_available` / `_unavailable` comme mots
  visibles de sa phrase (`kindLabel`) : reformuler ces mots d'état en 35.3 change la phrase de la boîte.

**Clés communes suffixées `_2`** (même slug que leur jumelle, texte légèrement différent par glyphe ou
ponctuation ; le suffixe est voulu et ne suit pas la règle « slug du texte ») :
- `common.precedent_2` / `common.suivant_2` : « ❮ Précédent » / « Suivant ❯ » (`homme-dragon`), face à
  `common.precedent` / `common.suivant` (« Précédent » / « Suivant », wizard de personnage).
- `common.chargement_2` : « Chargement... » (trois points), face à `common.chargement` : « Chargement… ».
- `common.date_a_definir_2` : « Date à définir. » (avec point, dialogue de lecture), face à
  `common.date_a_definir` (sans point, chronologie).
- Sans suffixe mais à noter : `common.choisir` porte « -- Choisir -- » (tirets inclus).

## 6. Hors périmètre, suivi ailleurs

Les textes Ryuutama restés en dur dans le front (libellés de fiche, règles, aides à la création, calcul
d'XP, familles de souffles…) sortiront plus tard vers un fichier lié au système de jeu. Suivi dans
`_bmad-output/implementation-artifacts/deferred-work.md` (architecture multi-système, épic 31).
