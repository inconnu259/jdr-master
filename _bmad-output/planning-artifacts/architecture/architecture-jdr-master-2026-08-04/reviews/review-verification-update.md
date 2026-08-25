# Revue de vérification — AD-16 à AD-20 + règle amendée d'AD-1

**Date :** 2026-08-05 · **Portée :** uniquement les AD neuves de la révision du 2026-08-05 (AD-2 à AD-15 vérifiées la veille).
**Méthode :** relecture du code réel (aucun `.html` ouvert).

**Verdict :** les AD neuves sont globalement bien ancrées dans le code, mais **AD-20 repose sur une affirmation fausse** (`findAllForPartie` n'exclut pas les brouillons, l'anti-spoil est explicitement frontend) et **AD-17 sous-estime l'extraction** (le mécanisme décrit est réparti sur trois couches, dont deux hors des deux fichiers cités).

---

## Bloquant

### B-1 — AD-20 : « les scénarios brouillons vivent derrière `GET /parties/:id/scenarios/drafts`, si bien que la liste servie à un joueur les exclut déjà » — **FAUX**

`apps/api/src/scenarios/scenarios.service.ts:231-246` :

```ts
// AD-6 : aucun filtrage par statut — l'anti-spoil est un rendu frontend, jamais serveur. Lecture
// ouverte à tout membre (getViewable), pas MJ-only comme listDrafts.
async findAllForPartie(...) {
  const partie = await this.parties.getViewable(partieId, userId);
  const scenarios = await this.prisma.scenario.findMany({
    where: { partieId },   // ← aucun filtre sur status
```

`GET /parties/:id/scenarios` (`scenarios.controller.ts:78`) renvoie donc **tous** les scénarios, `BROUILLON` compris, à tout membre. `listDrafts` (`scenarios.service.ts:215`, `getOwned` → MJ seul) est une **vue MJ dédiée aux brouillons**, pas un endpoint qui les retirerait de la liste normale. Le commentaire `scenarios.service.ts:889` le confirme : *« seul le rendu frontend (Story 9.2) protège l'anti-spoil »*.

Conséquence sur la règle d'AD-20 : la conclusion (« résolu côté client ») reste **techniquement atteignable** — le client a bien l'information, puisqu'il a tout — mais la **justification est inversée**. Le client ne filtre pas un compteur sur une charge utile déjà purgée : il porte la responsabilité de l'anti-spoil. C'est une charge de sécurité côté front, pas une simple commodité d'affichage. À reformuler explicitement, sinon une story lira « la liste exclut déjà les brouillons » et supprimera le filtrage front comme redondant — révélant les brouillons aux joueurs.

**Correction suggérée du texte :** « Vérifié : `GET /parties/:id/scenarios` renvoie tous les scénarios sans filtrage de statut (anti-spoil assumé côté rendu, cf. `scenarios.service.ts:231`) ; le client dispose donc de tout le nécessaire pour un compteur dépendant du lecteur. Le filtrage anti-spoil frontend n'est pas supprimable. »

---

## Majeur

### M-1 — AD-17 : le « mécanisme de portrait » n'est pas là où l'AD le situe ; l'extraction est plus large que « deux utilitaires »

Répartition réelle sur **trois couches** :

| Élément affirmé par AD-17 | Emplacement réel | Extractible tel quel ? |
| --- | --- | --- |
| Validation MIME | `characters/image-mime.util.ts:17` `detectImageMime()` (octets magiques, pas `Content-Type`) | Oui, déjà générique |
| Nettoyage EXIF | `characters/image-mime.util.ts:55` `stripImageMetadata()` = `sharp(buf).autoOrient().toBuffer()` | Oui, déjà générique |
| Plafond 5 Mo | `characters/characters.controller.ts:52` `MAX_PORTRAIT_SIZE`, appliqué **deux fois** : `limits.fileSize` du `FileInterceptor` (rejet pendant le streaming) **et** `MaxFileSizeValidator` du `ParseFilePipe`, plus `@UseFilters(MulterExceptionFilter)` pour remapper l'erreur Multer en 413 | **Non** — ce sont des décorateurs de contrôleur, pas un utilitaire. Le nouveau `party-cover.controller.ts` doit **rejouer les trois** (constante + double garde + filtre), sinon la couverture n'aura ni le rejet en streaming ni le 413 |
| Stockage disque | **`characters/character.service.ts:458-484`**, pas dans `portrait-storage.util.ts` : `mkdir` + `randomUUID()` + `writeFile` + verrou optimiste sur `updatedAt` + `unlink` de compensation si la DB échoue + suppression de l'ancien fichier | Partiellement — le squelette est extractible, le **verrou optimiste et l'émission SSE sont couplés au personnage** |

`portrait-storage.util.ts` ne contient **que la lecture** (`readPortraitFile`) et la validation de nom de fichier (`extractPortraitFilename`) — aucune écriture. L'AD laisse croire que l'extraction consiste à déplacer deux fichiers ; c'est faux, il faut aussi sortir du service la séquence d'écriture/compensation et **dupliquer volontairement la configuration de plafond au niveau du nouveau contrôleur**.

Le plafond de **5 Mo est bien exact** (`5 * 1024 * 1024`), et le nettoyage EXIF **existe réellement** (avec `autoOrient()` préalable pour ne pas perdre l'orientation) — ces deux points de l'AD sont confirmés.

### M-2 — AD-17 : consommateurs existants que le refactor casse, non mentionnés

- `apps/api/src/characters/ryuutama-pdf.service.ts:30,289` importe `readPortraitFile` depuis `./portrait-storage.util` — l'export PDF casse si le module déménage sans mise à jour.
- `apps/api/src/characters/character.service.spec.ts:48` fait `jest.mock('./image-mime.util', …)`. Un `jest.mock()` sur un **chemin qui n'existe plus** ne lève pas d'erreur explicite : le mock devient inopérant et les tests d'`updatePortrait()` partent appeler `sharp` réellement sur des buffers factices (signature magique seule, non décodable), avec un échec trompeur. Cette famille de piège est déjà documentée dans la mémoire projet.
- `extractPortraitFilename`/`isValidPortraitFilename` sont **spécifiques au portrait** : préfixe d'URL en dur (`/uploads/portraits/`) et regex `PORTRAIT_FILENAME_RE`. La généralisation impose de **paramétrer le préfixe et le répertoire** — c'est là que vit la défense anti-path-traversal, donc la mutation est sensible et mérite d'être nommée dans l'AD.
- Précédent non cité : un **troisième** mécanisme d'upload existe déjà, `apps/api/src/scenarios/document-storage.util.ts` + `document-mime.util.ts` (documents de scénario, `DOCUMENTS_DIR`), écrit sur le modèle du portrait mais séparé. La prémisse « deux chemins d'upload » d'AD-17 est donc déjà dépassée ; soit l'AD assume de laisser ce troisième chemin dehors (et le dit), soit son argument de non-divergence s'applique aussi à lui.

### M-3 — AD-17 / Structural Seed : `Partie.coverImageUrl` — la question « statique ou endpoint authentifié » n'est pas tranchée

`apps/api/src/main.ts:12-18` documente une décision explicite : *les portraits ne sont jamais servis en fichiers statiques*, ils passent par `GET /characters/:id/portrait` sous `AuthenticatedGuard` ; `portraitUrl` est une **pseudo-URL interne**, pas une URL servable. Le nom `coverImageUrl` et la mention « stockage disque » d'AD-17 laissent l'implémenteur libre d'exposer `/uploads/…` statiquement, ce qui contredirait cette décision — et le commentaire de `main.ts` sur `crossOriginResourcePolicy` montre que le sujet a déjà coûté du débat. À nommer : la couverture suit-elle le même schéma (endpoint dédié sous garde), et avec quelle règle d'accès (partie publique ? membres seuls ?) ?

---

## Mineur

### m-1 — AD-16 : « l'absence de ligne vaut couche éteinte » entre en tension avec le défaut attendu

`UserCalendarLayer` tel que spécifié fait qu'un **compte neuf n'a aucune ligne, donc aucune couche active** — calendrier vide au premier affichage. Le source tree dit pourtant `calendar-layers.service.ts # couches actives, défaut lu du compte`. Il manque la règle d'amorçage : soit les lignes sont créées à l'inscription, soit « aucune ligne » signifie *toutes actives par défaut* (ce qui inverse la sémantique et empêche d'éteindre la dernière couche), soit une colonne d'initialisation. Aucune de ces trois options n'est écrite. Par ailleurs le schéma réel confirme qu'**aucune structure de préférence utilisateur n'existe** sur `User` (`schema.prisma:15-37` : `id, email, pseudo, passwordHash, role, createdAt` + relations, aucun JSON, aucune table clé/valeur) — le nouveau modèle n'est donc **pas redondant**, l'affirmation d'AD-16 est confirmée.

### m-2 — AD-18 : « endpoint unique nouveau » — confirmé, aucun équivalent existant

Vérifié : `apps/api/src/availability/availability.controller.ts` n'expose que `POST /availability`, `GET /availability` (déclarations propres de l'utilisateur, `findActive`), `POST /:id/split`, `PATCH /:id`, `DELETE /:id` — aucune agrégation de séances/votes/inscriptions. `apps/api/src/parties/parties.controller.ts` n'a aucune route `/me` ni transverse : tout est scopé `:id` de partie (`available-slots`, `heatmap` inclus). Aucun dossier `apps/api/src/calendar/` n'existe. Aucune occurrence de « calendrier personnel » dans le dépôt. L'AD est exacte. *(Note : le source tree place `me-calendar.controller.ts` sous `calendar/`, mais y range aussi `parties.controller.ts` et `parties.service.ts` — coquille d'indentation du bloc, ces deux fichiers appartiennent à `parties/`.)*

### m-3 — AD-20 : l'affirmation sur `PollOptionDto.votes` est exacte, et même en deçà de la réalité

`packages/shared/src/index.ts:330-342` : `PollOptionDto.votes: PollVoteDto[]` avec `PollVoteDto = { userId, pseudo, answer }`. `apps/api/src/poll/poll.service.ts:17-21,185-194` confirme : `POLL_INCLUDE` charge `votes.user.pseudo` et `toDto` les projette **tous**, sans filtrage par lecteur ; `getActivePoll` est ouvert à tout membre (`getViewable`). Donc la charge utile porte non seulement les `userId` mais aussi les **pseudos** de tous les votants. La « condition de révision » d'AD-20 (masquer l'identité des autres votants) est donc plus proche qu'annoncé : elle porterait sur deux champs, pas un.
*(Écart annexe, hors périmètre de cette revue : `PollVoteDto` ne porte que `pseudo`, sans `displayName` — AD-2 exige les deux dans « tout DTO exposant une identité utilisateur ». À arbitrer : exception assumée ou champ à ajouter.)*

### m-4 — AD-19 et règle amendée d'AD-1 : cohérents avec le schéma réel

- AD-19 : `Partie.id String @id @default(uuid())` (`schema.prisma:47`) — dérivation déterministe possible depuis l'identifiant, aucun champ de graine existant à supprimer. Le schéma ne persiste rien de la bannière. Confirmé.
- AD-1 amendée : `User` n'a **aucun** des champs proposés (`displayName`, `theme`, `hideFinishedParties`, `listViewMode`, `listSort`) ni de blob `preferences` — tous sont des ajouts nets, sans redondance. La contrainte « deux points d'écriture pour `displayName` » reste donc pertinente. Confirmé.
- Confirmations d'appui pour les AD voisines, relues au passage : `Scenario.closedAt DateTime?` existe (`schema.prisma:437`) — la forme invoquée par AD-8 est réelle ; `PollVote @@unique([optionId, userId])` (`schema.prisma:243`) — AD-10 exact ; `Seance.dateValidee` sans champ de créneau (`schema.prisma:458`) — la lecture du créneau via `SessionPoll.chosenSlot` exigée par AD-9 est bien nécessaire ; `Partie` ne porte ni `closedAt`, ni `sheetVisibility`, ni `coverImageUrl` — tous neufs.
- Coquille : le bloc ERD ne liste pas `listViewMode`/`listSort` alors que la règle d'AD-1 et le bloc Prisma les incluent. Sans conséquence.
