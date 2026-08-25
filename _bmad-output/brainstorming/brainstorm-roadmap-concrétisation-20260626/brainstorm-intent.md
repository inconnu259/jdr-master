# brainstorm-intent — jdr-master roadmap 2026-06-26

## 1. Problème résolu

Les joueurs de JDR oublient le fil de la campagne entre les sessions, et la coordination de dates est un enfer. Le MJ prépare dans Amsel (offline, MJ-only) mais n'a aucun moyen de partager le résumé, les XP ou la planification avec ses joueurs. jdr-master est le **bridge entre le MJ et ses joueurs** — pas un remplaçant d'Amsel.

## 2. Utilisateurs & scopes

- **Scope 1** : usage perso du MJ — une seule instance Docker locale, un groupe de confiance, 0 infra publique.
- **Scope 2** : MJ héberge pour ses amis — instance cloud semi-publique, notifications email BLOQUANTES pour ce passage.
- **Scope 3** : plateforme open source publique — multi-groupes, modération, CMS. Hors MVP.

## 3. Décisions architecturales non-négociables

| Décision | Détail |
|---|---|
| **Plugin par composition** | Interface commune (`createCharacter`, `renderSheet`, `exportPDF`, `validate`, `computeDerived`) ; chaque système implémente la sienne ; steps typées, le front choisit le rendu (stepper ou formulaire). |
| **Validation 3 niveaux** | (1) strict joueur, (2) MJ override ponctuel via `grantedItems[]` (hors budget XP), (3) mode MJ-valide = approbation manuelle totale. |
| **Seed JSON automatique** | Les données de systèmes (Draconis d'abord) sont chargées depuis JSON en BDD — pas de CMS, les PDFs sont parsés une fois en extraction directe. |
| **Calendrier par indispos** | Chacun déclare ses indisponibilités (récurrent, ponctuel, contrainte positive), le système calcule l'intersection ; vote optionnel si ambiguïté. Différent de Doodle. |
| **jdr-master = bridge Amsel** | MVP MJ-side léger : titre session, recap MJ (privé), recap joueurs (partagé), XP, items structurés, décisions clés. Import Amsel JSON = long terme. |

## 4. Ordre systèmes de jeu

1. **Ryuutama** — simple, valide l'architecture plugin avec risque minimal.
2. **Conte de Minuit** — teste le workflow champs libres (MJ approve/reject + contre-proposition).
3. **Draconis** — le plus complexe (steps conditionnelles, hiérarchie modules) ; en dernier quand l'archi est prouvée.

## 5. MVP défini (P1→P5)

| Palier | Contenu |
|---|---|
| **P1** (DONE) | Auth + invitations + créer une partie |
| **P2** | Calendrier indispos + calcul automatique + vote |
| **P3** | Moteur plugin + Ryuutama (création perso guidée, validation 3 niveaux, XP, export PDF) |
| **P4** | Évolution & édition fiches en cours de campagne |
| **P5** | Session record hybride (recap MJ/joueurs, items structurés, lien item→fiche) |

**Critère de succès MVP** : un groupe peut créer une campagne, trouver des dates sans sondage manuel, créer et faire évoluer des personnages Ryuutama, et retrouver le fil de la dernière session — le tout depuis une interface web.

P6 = notifications SMTP (bloquant scope-2). P7 = 2e système (Conte de Minuit ou Draconis).

## 6. Points ouverts restants

- Le MJ peut-il voir "les 5 prochaines dates où tout le monde est dispo" directement sans vote ? (à trancher en P2)
- Visibilité granulaire des infos session (tous / sous-groupe / joueur individuel) — décidé SHOULD, design à affiner en P5.
- Message secret MJ→joueur en live — COULD, pas de décision de design.
- Hiérarchie de modules plugins (ex : Draconis hérite D&D 5e SRD) — à étudier avant P3/P7.
- Qui est propriétaire de la validité de la fiche quand MJ override ? Proposition "état MJ-override" (suspend la validation stricte) — à formaliser en P3.

## 7. Prochaine étape BMad suggérée

**Skill à appeler : `/bmad-create-story` ou `/bmad-prd` sur le palier P2 — Calendrier.**

Entrée : ce fichier + `docs/palier-1.md` (sections §7/§9/§11 pour le contexte auth/invitations déjà en place).
Objectif : produire les stories du calendrier (déclaration d'indispos, calcul de créneaux, vote sur dates) avec critères d'acceptance testables, prêtes pour `/bmad-dev-story`.
