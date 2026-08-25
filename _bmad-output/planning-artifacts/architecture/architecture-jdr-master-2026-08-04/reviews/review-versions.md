# Revue — Vérification des versions & ratification brownfield

**Cible :** `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md`
**Date :** 2026-08-04
**Méthode :** confrontation ligne à ligne des affirmations factuelles de la spine au code réel du dépôt (`git` propre, `master`, commit `4e7032a`). Aucun fichier autre que cette revue n'a été modifié.

**Verdict global :** la spine est **globalement fidèle au brownfield** — la grande majorité des affirmations vérifiables sont exactes, ce qui est rare. Mais **quatre affirmations sont fausses** (dont deux servent de justification à une AD), et **cinq mécanismes annoncés « déjà en place »** n'existent pas sous la forme décrite, ce qui rend leur coût d'implémentation invisible dans la spine.

---

## Volet 1 — Versions et technologies

### Ce qui est confirmé par le dépôt

La section **Stack** (« Aucun ajout de dépendance. Réutilise la stack existante, inchangée ») est **exacte sur toute la ligne**. Chaque version annoncée a été retrouvée :

| Annoncé dans la spine | Source de vérité | Verdict |
| --- | --- | --- |
| Node 24 LTS | `package.json` racine → `"engines": { "node": ">=24 <25" }` | ✅ exact |
| pnpm 11.8 | `package.json` racine → `"packageManager": "pnpm@11.8.0"` | ✅ exact |
| NestJS 11 | `apps/api/package.json` → `@nestjs/common ^11.1.28`, `@nestjs/core ^11.1.28` | ✅ exact |
| Prisma 7 | `apps/api/package.json` → `prisma ^7.8.0`, `@prisma/client ^7.8.0` | ✅ exact |
| Angular 22 | `apps/web/package.json` → `@angular/core ^22.0.0`, `@angular/cli ^22.0.3` | ✅ exact |
| PostgreSQL 17 | `docker-compose.yml` → `image: postgres:17-alpine` | ✅ exact |
| argon2 | `argon2 ^0.44.0` | ✅ exact |
| Helmet | `helmet ^8.2.0` | ✅ exact |
| `@nestjs/throttler` | `^6.5.0` | ✅ exact |
| `class-validator` | `^0.15.1` | ✅ exact |

Aucune techno fantôme, aucune techno abandonnée, aucun numéro de version manifestement récité de mémoire. Les dépendances nécessaires aux AD sont toutes déjà présentes :

- **AD-5** (changement d'e-mail, deux canaux) suppose l'envoi d'e-mails → `@nestjs-modules/mailer ^2.3.7` + `nodemailer ^9.0.3` + `handlebars ^4.7.9` présents, et `apps/api/src/email/` existe (`EmailService`, `EmailTemplate` enum, `templates/`). ✅ Le « aucun ajout de dépendance » tient.
- **AD-14** (SSE) → `apps/api/src/realtime/realtime-events.service.ts` expose bien `partieTopic()` et `userTopic()`. ✅
- **AD-1 / AD-8** (migration Prisma) → générateur toujours `prisma-client-js` (`schema.prisma:2`) ; aucune AD ne suppose le nouveau générateur. ✅

### Observations mineures, non bloquantes

**V-1 — `@prisma/adapter-pg` est déjà installé et actif, alors que le générateur reste legacy.**
`apps/api/package.json` contient `@prisma/adapter-pg ^7.8.0`, et `auth.service.ts:80-83` documente explicitement des comportements du driver adapter Prisma 7 (`meta.target` non fiabilisé sur P2002). Le `CLAUDE.md` annonce la migration `prisma-client` + driver adapter « prévue au palier 1 » — elle est donc **partiellement faite**. La spine ne s'appuie sur rien de cela, mais toute nouvelle contrainte d'unicité introduite par AD-1 (`@@unique([userId, partieId])` sur `PartieFavorite`, `@@unique([userId, announcementId])` sur `AnnouncementRead`) produira une **P2002 au message générique**, exactement comme dans `register()`. À anticiper dans les stories, pas dans la spine.

**V-2 — divergence de version TypeScript entre workspaces, non mentionnée.**
`apps/api` est en `typescript ^5.7.3`, `apps/web` en `typescript ~6.0.2`. Or `packages/shared` (consommé par les deux) n'épingle rien. AD-13 fait reposer une **garantie de compilation** sur le typage croisé des thèmes (« une clé manquante devient une erreur de compilation ») ; cette garantie vit côté web (TS 6), donc elle tient. Mais AD-2, qui ajoute `displayName` à de nombreux DTO de `packages/shared`, sera type-checké par deux compilateurs de générations différentes. Rappel du `MEMORY.md` projet : `ts-jest` côté API ne type-check pas en cross-file (`isolatedModules`) — les changements de signature de DTO d'AD-2 **ne seront pas détectés par les tests API**, seulement par `pnpm typecheck`. La spine ne le dit pas ; ce n'est pas son rôle, mais les stories AD-2 doivent l'imposer.

---

## Volet 2 — Ratification brownfield

### A. Affirmations FAUSSES (à corriger dans la spine)

#### B-1 — 🔴 **AD-6 : `AuthService.resetPassword()` ne « conserve pas la session courante » — il coupe TOUT.**

> Spine, AD-6 : « coupe toutes les autres sessions actives **et conserve la session courante** — **comportement identique à `AuthService.resetPassword()`** »

Code réel, `apps/api/src/auth/auth.service.ts:210-216` :

```ts
const activeSessions = await tx.userSession.findMany({
  where: { userId: record.userId },
  select: { sid: true },
});
const sids = activeSessions.map((s) => s.sid);
await tx.session.deleteMany({ where: { sid: { in: sids } } });
await tx.userSession.deleteMany({ where: { userId: record.userId } });
```

Aucune exclusion du `sid` courant : `resetPassword()` supprime **toutes** les lignes `UserSession` de l'utilisateur, sans exception. Le comportement décrit par AD-6 (« garde la courante ») est donc **un comportement nouveau**, pas la réutilisation d'un comportement existant.

C'est excusable au sens où `resetPassword()` est un flux **non authentifié** (lien e-mail) : il n'y a pas de « session courante » à préserver. Mais AD-6 s'appuie sur cette prétendue identité de comportement pour se dispenser de trancher : sa section *Prevents* dit vouloir éviter « deux chemins de changement de mot de passe se comportant différemment vis-à-vis des sessions ouvertes, **sans qu'aucune règle ne dise lequel a raison** » — or la spine institue précisément deux comportements différents (l'un coupe tout, l'autre garde la courante) tout en affirmant qu'ils sont identiques. **La règle doit être reformulée** : « même mécanisme (index `UserSession`), politique différente et assumée : le flux par e-mail coupe tout, le flux en session préserve le `sid` appelant ».

**Conséquence d'implémentation non mentionnée :** la coupure de sessions n'est pas une méthode réutilisable — elle est **inlinée dans la transaction de `resetPassword()`**. AD-4 dit « toute coupure de session reste déléguée à `AuthService`, déjà seul propriétaire de ces mécanismes ». Le mécanisme existe, mais **aucune API ne l'expose** : `AuthService` ne publie que `recordSession(userId, sid)` et `forgetSession(sid)`. Il faudra **extraire** une méthode (`revokeSessions(userId, exceptSid?)`) et la réutiliser dans `resetPassword()`. La spine présente comme « réutilisation » ce qui est en réalité un refactoring de `AuthService`.

#### B-2 — 🔴 **AD-10 : le `DELETE` MJ existant ne « supprime pas le sondage entier » — il le ferme.**

> Spine, AD-10 : « distinct du `DELETE` MJ existant **qui supprime le sondage entier** »

Code réel, `apps/api/src/poll/poll.controller.ts:83-90` → `PollService.close()`, `apps/api/src/poll/poll.service.ts:159-173` :

```ts
await this.prisma.sessionPoll.update({
  where: { id: pollId },
  data: { status: 'CLOSED' },
});
```

Le verbe HTTP est `DELETE`, mais la sémantique est une **fermeture** (`status: OPEN → CLOSED`), pas une suppression : le `SessionPoll`, ses `PollOption` et ses `PollVote` survivent intégralement — c'est structurellement nécessaire, `Seance.pollId` pointant dessus (`schema.prisma:454`). La formulation de la spine est fausse et, si elle est reprise telle quelle dans une story, un développeur pourra croire qu'un `deleteMany` existe déjà comme précédent.

**Reformulation exacte :** « distinct du `DELETE :pollId` MJ existant, qui **ferme** le sondage (`status: CLOSED`) sans rien supprimer ».

#### B-3 — 🟠 **AD-2 : `UserSearchResultDto` n'est pas la seule fuite d'e-mail — `PartieMemberDto` en expose une plus large, non traitée.**

L'affirmation « `UserSearchResultDto` renvoie l'e-mail aujourd'hui » est **exacte** (`packages/shared/src/index.ts:55-59`, `users.service.ts:searchByEmailOrPseudo` → `select: { id, pseudo, email }`). ✅

Mais AD-2 pose que c'est **la seule exception** au contrat d'identité, et laisse entendre que corriger la recherche règle la question de l'e-mail. Or `packages/shared/src/index.ts:62-67` :

```ts
export interface PartieMemberDto {
  userId: string;
  pseudo: string;
  email: string;       // ← servi à TOUT membre de la partie
  joinedAt: string;
}
```

alimenté par `PartiesService.listMembers()` (`parties.service.ts:102-109`), dont la garde est `getViewable()` — donc **MJ ou n'importe quel membre**. L'e-mail de chaque participant est aujourd'hui exposé à tous ses coéquipiers via `GET /parties/:id/members`. AD-2 impose d'ajouter `displayName` à `PartieMemberDto` — la story y touchera donc forcément. **La spine devrait trancher au passage** : l'e-mail reste-t-il dans `PartieMemberDto` ? Si la règle de FR-30 (« ni nom affiché, ni e-mail ») a une justification de confidentialité, elle s'applique a fortiori ici. En l'état, la spine laisse une fuite plus large que celle qu'elle corrige, sans la nommer.

#### B-4 — 🟠 **AD-13 : la structure actuelle de `tones.ts` n'offre PAS la garantie que la spine dit vouloir préserver.**

> Spine, AD-13 (*Prevents*) : « une découpe en trois fichiers **qui perdrait la seule garantie que la structure actuelle offrait encore** »

Code réel, `apps/web/src/app/core/theme/tones.ts:11` :

```ts
export const TONE_MAP: Record<Theme, Record<string, string>> = { … };
```

`Record<string, string>` **n'apporte aucune garantie de complétude des clés** : un thème peut omettre `nav.calendar`, en ajouter une inconnue, en mal orthographier une — rien n'est détecté à la compilation. La seule garantie actuelle est que **les trois thèmes sont présents** (les clés de `Record<Theme, …>`), ce qu'une découpe en trois fichiers réunis par un `index.ts` typé `Record<Theme, …>` préserve trivialement.

L'AD reste **bonne** — le thème de référence typant les deux autres est un **gain net** de sécurité. Mais son *Prevents* est écrit à l'envers : il présente comme *conservation d'un acquis* ce qui est en réalité une *introduction d'une garantie qui n'existait pas*. À reformuler, sous peine qu'une story se contente de « ne pas régresser » et n'implémente jamais le typage croisé.

---

### B. Mécanismes annoncés « déjà en place » qui exigent en réalité un refactoring non chiffré

#### C-1 — 🔴 **AD-7 : `toDto()` est une fonction libre sans viewer, sans partie, sans accès Prisma — le filtrage y est impossible sans en changer la signature à ~14 appels.**

L'affirmation structurante d'AD-7 (« le filtrage s'applique dans `toDto()`, point de sérialisation traversé par `findOne`, `findByPartie` et les trois exports PDF ») est **vérifiée sur le fond** :

- `characters.controller.ts:78`, `:99`, `:117` → les **trois** exports PDF appellent bien `this.characters.findOne(id, user.id)`. ✅
- `findOne` (`character.service.ts:340-375`) et `findByPartie` (`:377-407`) passent bien par `toDto()`. ✅
- Le constat de fuite est exact : `findOne` s'appuie sur `getViewable()` (MJ **ou** membre, cf. commentaire `:346-351`) — **un joueur peut donc bien exporter en PDF la fiche complète d'un coéquipier aujourd'hui.** ✅ Le *Prevents* d'AD-7 est factuellement juste.

Mais la forme réelle de `toDto()` (`character.service.ts:1581-1610`) est :

```ts
function toDto(
  character: any,
  ownerPseudo: string,
  ownerIsMj: boolean,
  viewerIsMj: boolean,
): CharacterDto
```

C'est une **fonction libre en bas de fichier**, synchrone, hors classe, sans `PrismaService`. Trois conséquences que la spine passe sous silence :

1. **Elle ne sait pas qui est le viewer.** Elle reçoit `viewerIsMj: boolean`, jamais le `userId`. Or AD-7 exige « le filtre ne s'applique jamais **au propriétaire de la fiche** ni au MJ ». Il faut donc lui passer un `viewerId` (ou un `viewerIsOwner: boolean`) supplémentaire — **changement de signature**.
2. **Elle n'a pas accès à `Partie.sheetVisibility`.** Étant synchrone et sans Prisma, la configuration doit être **chargée par chaque appelant** et passée en argument — soit un second paramètre nouveau.
3. **Il y a ~14 sites d'appel** (`:259`, `:369`, `:400`, `:491`, `:516`, `:550`, `:773`, `:832`, `:953`, `:1314`, `:1384`, …). La plupart sont des retours de mutation propriétaire-seul où le filtre ne doit **pas** s'appliquer — mais tous devront être mis à jour et **le compilateur ne les rattrapera pas tous si les nouveaux paramètres sont optionnels**. Rappel `MEMORY.md` : `ts-jest` ne type-check pas en cross-file — seul `pnpm typecheck` verra la casse.

L'AD reste juste dans son choix ; c'est son **coût** qui est invisible. Une phrase suffirait : « `toDto()` est aujourd'hui une fonction libre à 4 paramètres ; l'AD implique de lui adjoindre le viewer et la configuration de la partie, et de mettre à jour ses appels ».

**Sous-constat :** `sheetSchema` est typé `unknown` dans le contrat partagé (`packages/shared/src/index.ts:609`). AD-7 fait construire l'écran de configuration MJ « depuis cette déclaration » — le front devra donc **typer ce qui est aujourd'hui `unknown`**, ce qui est un vrai changement de `packages/shared`, non mentionné.

**Sous-constat positif :** l'unité de verrouillage annoncée pour Ryuutama est **exactement juste**. `getSchema()` (`game-system.service.ts:250-277`) déclare bien `narrative: { type: 'object', optional: true }` comme seule clé objet narrative, et `packages/game-rules/src/ryuutama/types.ts:48-56` liste **précisément** les sept sous-champs cités par la spine : `sex`, `age`, `physicalTraits`, `homeTown`, `motivation`, `name`, `personality`. Aucun écart. ✅ (Note : `character.service.ts:1269` restreint l'édition narrative à « 6 clés » — le 7e, `name`, a son propre chemin. Sans incidence sur AD-7, qui parle de lecture.)

#### C-2 — 🟠 **AD-3 / AD-4 : `GET /me/party-signals` ne peut pas vivre dans `parties.controller.ts`.**

Le *Source tree* de la spine annonce :

```text
parties/
  parties.controller.ts    # + GET /me/party-signals (AD-3, AD-4)
```

Or `parties.controller.ts:24` est décoré `@Controller('parties')` : toute route qui y est ajoutée est préfixée `/parties/…`. Une route `/me/party-signals` exige **un second contrôleur** dans `PartiesModule` (ex. `me-parties.controller.ts`, `@Controller('me')`). Ce n'est pas une erreur de l'AD — la règle « `/me` est une convention de routage, pas une frontière de module » est saine et compatible — mais **le seed structurel décrit un fichier qui ne peut pas porter la route**. Idem pour `GET /me/characters` (D-10), annoncé sur `character.service.ts` alors que `CharactersController` est `@Controller('characters')`.

#### C-3 — 🟠 **AD-8 : `PartiesService` ne sérialise rien — ajouter `closedAt` et `sheetVisibility` à `Partie` les expose automatiquement à tous.**

`AD-7` construit toute sa sécurité sur un **point de sérialisation unique** côté personnage. Côté partie, ce point **n'existe pas** : `listForUser()` (`parties.service.ts:61-74`), `getOwned()` (`:77-82`), `getViewable()` (`:85-94`) et `update()` (`:125-133`) retournent tous **l'objet Prisma brut**, jamais un `PartieDto` mappé. Le `PartieDto` de `packages/shared/src/index.ts:39-49` est donc un contrat **purement déclaratif**, que rien ne fait respecter à l'exécution.

Conséquence directe des ajouts de la spine :

- `closedAt` (AD-8) apparaîtra dans toutes les réponses sans qu'aucun code ne soit écrit — heureux hasard, c'est même souhaité par FR-3/FR-10/FR-44. Mais `PartieDto` **ne le déclarera pas** tant que personne ne pense à l'ajouter, et le front ne le verra pas.
- `sheetVisibility Json?` (AD-7) sera **également exposé à tous les joueurs**, via `GET /parties/:id` (`getViewable`) et `GET /parties` (`listForUser`). La configuration anti-spoil du MJ — c'est-à-dire *la liste de ce qui est caché* — devient lisible par ceux à qui on le cache. Ce n'est pas une fuite de contenu (les valeurs restent filtrées par `toDto()`), mais c'est un signal (« le MJ a verrouillé la motivation de X ») que la spine n'a manifestement pas envisagé.

**À trancher dans la spine** : soit ajouter une convention « `PartiesService` mappe explicitement vers `PartieDto` » (symétrique d'AD-7), soit acter que `sheetVisibility` est public par nature.

#### C-4 — 🟡 **AD-11 : le compteur anti-course décrit au singulier est en réalité double, et le rename casse cinq consommateurs non listés.**

L'AD dit conserver « le compteur `seq` anti-course ». `mode.service.ts:20-21` en a **deux** — `mjSeq` et `playerSeq` — un par liste, avec deux méthodes de rafraîchissement distinctes (`refreshMjParties`, `refreshPlayerParties`). Détail, mais l'AD-11 promet une conservation « à l'identique » : la liste unifiée FR-7/FR-8 devra soit s'alimenter des deux listes existantes, soit introduire un **troisième** compteur — ce que l'AD n'anticipe pas. (Précédent utile : `OpenPollsService` a déjà migré vers un compteur **par partie** après un bug de production, cf. `open-polls.service.ts:16-24`.)

Consommateurs de `ModeService` que la suppression de `core/mode/` casse, **aucun n'étant cité par la spine** :

| Fichier | Usage |
| --- | --- |
| `apps/web/src/app/layout/shell/shell.ts:35,42-43,48-54` + `shell.html:16-17,61-62` | la bascule elle-même (deux occurrences : desktop + mobile) |
| `apps/web/src/app/features/dashboard/dashboard.ts:7,22,30-32,67` | `mode`, `mjParties`, `playerParties`, `refreshPlayerParties()` |
| `apps/web/src/app/core/poll/open-polls.service.ts:4,10` | lit `playerParties` — **consommateur fonctionnel, pas cosmétique** |
| `apps/web/src/app/core/realtime/realtime.service.ts:9,58,68-71` | câblage SSE `user:{id}` → `notifyChanged()` |
| specs : `mode.service.spec.ts`, `dashboard.spec.ts`, `open-polls.service.spec.ts`, `realtime.service.spec.ts:97,115,200,208` | injectent `ModeService` par token |

**Point d'attention particulier :** `realtime.service.spec.ts:200` contient un test nommé « *un topic `partie:` ne déclenche PAS `notifyChanged()` sur ModeService (bug fix : préfixe rebranché sur `user:`)* ». Or AD-14 exige que `PartySignalsService` se rafraîchisse sur **les deux préfixes** `partie:` **et** `user:`. Les deux règles sont compatibles (services différents), mais elles sont **contre-intuitives côté implémentation** : la story devra bien câbler `MyPartiesService` sur `user:` **seul** et `PartySignalsService` sur les **deux**, sans « harmoniser » par inadvertance — ce qui rejouerait exactement le bug de production documenté. À rendre explicite dans AD-14.

**Effet de bord non listé :** les clés de thème `nav.mode_joueur` / `nav.mode_mj` deviennent mortes dans les **trois** thèmes (`tones.ts:17-18`, `182-183`, `344-345`). Le nettoyage doit se faire au moment de la découpe AD-13, sinon le thème de référence les fige comme obligatoires pour toujours.

#### C-5 — 🟡 **AD-10 : la route `DELETE …/poll/:pollId/vote` ne peut pas désigner la ligne à supprimer.**

`PollVote` est unique **par option** : `@@unique([optionId, userId])` (`schema.prisma:243`), et `castVote` prend un `optionId` dans son corps (`CastVoteDto`, `packages/shared/src/index.ts:351-354`). Un joueur a donc **N lignes `PollVote`** pour un sondage à N options, pas une. La règle d'AD-10 dit « supprime **la ligne** `PollVote` » (singulier) et propose `DELETE …/poll/:pollId/vote`, sans `optionId`.

Deux lectures possibles, non tranchées : (a) retirer **une** réponse sur **une** option → il faut `DELETE …/poll/:pollId/vote/:optionId` ; (b) retirer **toutes** ses réponses au sondage → `deleteMany`, et la formulation devrait être au pluriel. Le raisonnement de l'AD (« l'absence de ligne signifie déjà *n'a pas répondu* », `UNKNOWN` dans l'agrégation) fonctionne dans les deux cas, mais **la forme de la route en dépend**. À préciser avant l'epic.

---

### C. Affirmations vérifiées et exactes (ratification confirmée)

Pour équilibrer : la majorité des affirmations brownfield tiennent.

| Affirmation de la spine | Vérification | Verdict |
| --- | --- | --- |
| `Partie.closedAt` — « même forme que `Scenario.closedAt` déjà en place » (AD-8) | `schema.prisma:437` → `closedAt DateTime?` sur `Scenario`. Aucun `closedAt` sur `Partie` aujourd'hui | ✅ exact |
| Pattern `PasswordResetToken` : « `tokenHash` unique, `expiresAt`, `usedAt`, usage unique » (AD-5) | `schema.prisma:127-137` — les quatre éléments y sont, à l'identique | ✅ exact |
| `AuthService` est propriétaire de l'index `UserSession` (AD-4) | `schema.prisma:144-152` + `recordSession`/`forgetSession`/`resetPassword` | ✅ exact |
| Le rôle sur une partie est dérivé (`mjId === userId`), jamais persisté (AD-3) | `parties.service.ts:88`, `:187`, `:323`, `character.service.ts:372-373`. Aucun modèle de rôle en base | ✅ exact |
| `getOwned` / `getViewable` existent et distinguent MJ-seul / MJ-ou-membre (P1-AD-3) | `parties.service.ts:77-94` | ✅ exact |
| Pattern de lecture en lot déjà établi (`resolveParticipants`, `findByPartie`) | `parties.service.ts:142-168` (deux requêtes, un `Promise.all`) ; `character.service.ts:390-396` (« pas de N+1 », commentaire explicite) | ✅ exact |
| `AvailableSlotDto` (vue MJ, statut par membre) vs `AggregatedSlotDto` (vue joueur, compteurs sans identité) — AD-9 | `packages/shared/src/index.ts:301-315` + branchement `if (isMj)` à `parties.service.ts:295-304` | ✅ exact, y compris la nuance « sans identité » |
| Aucun nouveau `SlotStatus` nécessaire ; `UNAVAILABLE`/`UNKNOWN` suffisent (AD-9, AD-10) | `packages/shared/src/index.ts:236` → `'AVAILABLE' \| 'UNAVAILABLE' \| 'UNKNOWN'` | ✅ exact |
| `VoteAnswer` reste `YES\|NO\|MAYBE` (AD-10) | `schema.prisma:178-182` + `packages/shared/src/index.ts:242` | ✅ exact |
| `GET /parties/:id/poll` renvoie déjà les créneaux d'un vote (AD-9, « aucun changement serveur » pour FR-34) | `poll.controller.ts:42-48` → `findOpen`, `SessionPollDto.options[]` avec `date`/`slot` (`index.ts:318-327`) | ✅ exact |
| `AvailabilityDeclaration` est de portée globale (pas par partie) — prérequis d'AD-9 | `schema.prisma:184-201`, commentaire « Portée globale (pas par partie) » | ✅ exact |
| `emit(topic)` en fin de mutation, hors transaction (P7-AD-2, AD-14) | `parties.service.ts:120-121`, `auth.service.ts:74-76` (commentaire « émis après résolution complète de la transaction, jamais dans son callback ») | ✅ convention réellement en place |
| `notifyChanged(): void` comme contrat public front (P7-AD-4) | `mode.service.ts:70-73`, `open-polls.service.ts:33+` | ✅ exact |
| `User` ne porte aujourd'hui **aucune** préférence (AD-1) | `schema.prisma:15-37` — ni `displayName`, ni `theme`, ni `hideFinishedParties`, ni table clé/valeur | ✅ exact, le terrain est vierge |
| `Announcement` existe et est scopée partie/scénario (AD-1, FR-13) | `schema.prisma:506-516` | ✅ exact |
| `Seance` porte bien une date (`dateValidee`) exploitable par AD-9 | `schema.prisma:458` | ✅ exact |
| `apps/api/src/account/` n'existe pas (module réellement nouveau) | vérifié : répertoire absent | ✅ exact |
| Un dossier par capacité dans `apps/api/src/` (P8-AD-6) | `auth/`, `parties/`, `characters/`, `poll/`, `users/`, `email/`, `realtime/`, `game-systems/`, `availability/`, `scenarios/`, `invitations/`, `prisma/` | ✅ convention réellement en place |
| `THEMES` / `THEME_NAMES` / `TONE_MAP` sont bien les trois exports à recomposer (AD-13, source tree) | `tones.ts:3`, `:5`, `:11`, consommés par `theme-tone.service.ts:2` | ✅ exact |
| `localStorage` est aujourd'hui la seule source de vérité du thème (AD-13) | `theme-tone.service.ts:4,20,30-34` — clé `jdr-theme`, défaut `grimoire-emeraude` | ✅ exact, et le défaut coïncide avec le thème de référence choisi |
| `getSchema()` est codé en dur pour Ryuutama seul (Deferred : « registre de plugin ») | `game-system.service.ts:240-249`, commentaire explicite | ✅ exact |
| Q-13 : « souffles et éveils existent déjà de bout en bout » | cohérent avec la présence de `CapabilityType` (`game-rules/ryuutama/leveling.ts`) et `levelUps[].capabilities` (`types.ts:58+`) | ✅ plausible, non contredit |

---

### D. Formulations ambiguës (à resserrer, sans enjeu structurel)

**D-1 — AD-3 : « la protection anti-course est encore *commentée* dans `mode.service.ts` ».**
En français, « commentée » se lit spontanément *mise en commentaire* — c'est-à-dire **désactivée**. Ce serait faux : la protection est **active** (`mode.service.ts:35-50, 52-62`, compteurs `mjSeq`/`playerSeq` pleinement opérants) ; ce qui est « commenté » est le **commentaire de 7 lignes qui la documente** (`:28-34`). Si le lecteur retient « la protection n'est pas active », il pourrait la réimplémenter — exactement ce qu'AD-11 veut éviter. Remplacer par « *documentée en commentaire* ».

**D-2 — AD-5 : le pattern `PasswordResetToken` n'est pas seulement `tokenHash @unique`.**
La spine copie fidèlement les quatre attributs, mais **omet la pièce maîtresse** : parce que le hash est un argon2 (non indexable), le jeton transmis à l'utilisateur est un **composite `"{id}.{secret}"`** (`auth.service.ts:147`, `:166-189`), la recherche se fait par `id` et la vérification par `argon2.verify` — et l'ordre (vérifier **avant** de réclamer) est explicitement documenté comme load-bearing (`:157-159`). Le `@unique` sur `tokenHash` est en pratique **inutilisé**. `EmailChangeToken` doit reproduire le composite, pas seulement les colonnes. À expliciter, sinon une story écrira un `findUnique({ where: { tokenHash } })` qui ne trouvera jamais rien.

**D-3 — AD-4 : « argon2 […] propriété exclusive d'`AuthService` » (également en *Consistency Conventions*).**
Faux au sens strict : `UsersService.create()` appelle `argon2.hash()` directement (`users.service.ts`, import `* as argon2`). Sans conséquence pratique (`create()` n'est plus appelé par le flux d'inscription, qui passe par `AuthService.register()`), mais la convention est énoncée comme un fait établi alors qu'elle a déjà une exception dans le dépôt. Soit la reformuler en objectif (« doit le devenir »), soit nettoyer `UsersService.create()` au passage.

**D-4 — P1-AD-3 : `getOwned`/`getViewable` ne sont pas encore « le seul point de vérité d'appartenance ».**
`getAvailableSlots()` (`parties.service.ts:187-189`) et `getHeatmap()` (`:323-325`) **réimplémentent leur propre contrôle** :

```ts
const isMj = partie.mjId === userId;
const isMember = memberships.some((m) => m.userId === userId);
if (!isMj && !isMember) throw new ForbiddenException();
```

C'est fonctionnellement équivalent à `getViewable()`, et fait pour une bonne raison (les `memberships` sont déjà chargés par `resolveParticipants()`, éviter une requête). Mais l'invariant hérité est présenté comme **acquis**, alors qu'il connaît déjà deux dérogations — précisément dans les deux méthodes qu'AD-9 va modifier. La spine devrait soit ratifier explicitement cette dérogation (« autorisée quand les memberships sont déjà en main »), soit ne pas énoncer l'invariant au présent.

---

## Synthèse des actions recommandées sur la spine

| # | Gravité | Action |
| --- | --- | --- |
| B-1 | 🔴 | Réécrire AD-6 : `resetPassword()` coupe **toutes** les sessions ; la préservation de la session courante est une **politique nouvelle**, à assumer. Mentionner l'extraction d'une méthode de révocation réutilisable dans `AuthService`. |
| B-2 | 🔴 | Corriger AD-10 : le `DELETE :pollId` existant **ferme** le sondage (`status: CLOSED`), il ne le supprime pas. |
| C-1 | 🔴 | Ajouter à AD-7 le coût réel : `toDto()` est une fonction libre à 4 paramètres, sans viewer ni Prisma ; l'AD implique un changement de signature propagé à ~14 appels + le typage de `sheetSchema` (aujourd'hui `unknown`). |
| C-3 | 🟠 | Trancher l'exposition de `Partie.sheetVisibility` : `PartiesService` renvoie l'objet Prisma brut, la configuration anti-spoil serait lisible par les joueurs concernés. |
| B-3 | 🟠 | AD-2 : statuer sur l'`email` de `PartieMemberDto`, fuite plus large que celle de `UserSearchResultDto` que l'AD corrige. |
| B-4 | 🟠 | Reformuler le *Prevents* d'AD-13 : le typage croisé est une garantie **nouvelle**, pas une garantie préservée. |
| C-2 | 🟠 | Corriger le *Source tree* : `/me/party-signals` et `/me/characters` exigent de nouveaux contrôleurs, `@Controller('parties')`/`@Controller('characters')` ne pouvant pas les porter. |
| C-4 | 🟡 | AD-11 : deux compteurs (`mjSeq`, `playerSeq`), pas un ; lister les cinq consommateurs (`shell`, `dashboard`, `OpenPollsService`, `RealtimeService`, specs) ; expliciter dans AD-14 que `MyPartiesService` reste sur `user:` **seul** quand `PartySignalsService` écoute les deux préfixes ; prévoir le retrait des clés `nav.mode_*` des trois thèmes. |
| C-5 | 🟡 | AD-10 : préciser la route — `PollVote` est unique **par option**, un joueur a N lignes par sondage. |
| D-1..D-4 | 🟡 | Resserrer : « documentée en commentaire » (pas « commentée ») ; expliciter le jeton composite `{id}.{secret}` d'AD-5 ; nuancer « argon2 exclusif à `AuthService` » (`UsersService.create()`) et « `getOwned`/`getViewable` seul point de vérité » (`getAvailableSlots`/`getHeatmap`). |

**Aucune correction n'est requise sur le volet versions/technos.**
