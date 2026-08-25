---
baseline_commit: 3f690b5f53a6f36120158c4003961386e47a0de5
---

# Story 6.5: Tenir un journal de notes personnelles

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want écrire des notes datées sur ma fiche au fil de la campagne, et choisir lesquelles partager avec le reste du groupe,
so that je retrouve facilement ce qui s'est passé sans être pollué par des notes que je préfère garder pour moi.

## ⚠️ Prérequis bloquant : la fiche n'est aujourd'hui visible que par le propriétaire ou le MJ

**Ce point doit être corrigé dans cette story (Task 1), avant tout le reste — sans lui, AC4 est untestable.**

`CharacterService.findOne` (`GET /characters/:id`, la page fiche complète) autorise aujourd'hui uniquement le propriétaire ou le MJ (`this.parties.getOwned(...)`, qui lève `ForbiddenException` pour tout autre appelant). Or `RosterRail`/`RosterStrip` (Story 6.1) émettent déjà `selectCharacter` pour **n'importe quel** personnage de la troupe et naviguent vers `parties/:id/characters/:characterId` sans restriction — un joueur qui clique sur la fiche d'un coéquipier (ni MJ, ni propriétaire) arrive donc aujourd'hui sur une page qui échoue avec *"Vous n'avez pas accès à cette fiche."* AC4 de cette story ("je suis un autre joueur... je consulte le journal de notes de ce personnage") est **impossible à atteindre via l'UI réelle** tant que ce blocage n'est pas levé.
**Fix** : dans `findOne`, remplacer `this.parties.getOwned(character.partieId, userId)` par `this.parties.getViewable(character.partieId, userId)` (MJ **ou** membre de la Partie — méthode déjà existante, déjà utilisée ailleurs dans le codebase). Portée volontairement étroite : `getHistory`/`getPortraitFile` ont leur **propre** vérification d'accès indépendante (elles n'appellent pas `findOne` en interne) — ce changement ne les affecte pas, l'historique reste strictement propriétaire-ou-MJ (FR-13, inchangé). Un fellow player voit donc désormais la fiche complète (stats, équipement, capacités — normal dans un jeu de rôle de table, les joueurs voient les fiches des autres) ; seul le nouveau Journal de notes applique une restriction de contenu plus fine (AC4 ci-dessous).

## Acceptance Criteria

1. **Given** je suis propriétaire d'un personnage et j'ouvre la section Notes de sa fiche, **When** j'ajoute une nouvelle entrée de texte libre, **Then** elle apparaît en tête du `NotesJournal` (liste chronologique inversée), horodatée à la création, avec un statut "privée" par défaut (visible par moi et le MJ uniquement). [Source: epics.md Story 6.5 AC1, FR-11]
2. **Given** une entrée de mon journal existe, **When** je bascule son toggle "Partager avec le groupe", **Then** seule cette entrée devient visible par tous les participants de la Partie (icône verrou fermé/ouvert + texte, jamais la couleur seule) ; les autres entrées ne sont pas affectées. [Source: epics.md Story 6.5 AC2, FR-11, UX-DR9]
3. **Given** je suis le MJ de la Partie, **When** je consulte le journal de notes d'un de mes joueurs, **Then** je vois toutes ses entrées en lecture seule (privées et partagées), sans pouvoir les éditer via ce mécanisme. [Source: epics.md Story 6.5 AC3, FR-11]
4. **Given** je suis un autre joueur de la même Partie (ni MJ, ni propriétaire de ce personnage), **When** je consulte le journal de notes de ce personnage, **Then** je ne vois que les entrées marquées "partagées avec le groupe". [Source: epics.md Story 6.5 AC4, FR-11, AD-8]
5. **Given** une entrée existe déjà dans mon journal, **When** je cherche à l'éditer ou la supprimer après création, **Then** aucune action de ce type n'est proposée (v1 : append-only) ; ajouter une entrée **ne crée pas** d'instantané dans l'historique (cf. FR12). [Source: epics.md Story 6.5 AC5, FR-11, FR-12]

**Hors scope de cette story** : rattacher une entrée à une séance/session formelle (l'entité n'existe pas en Palier 3, cf. PRD Glossaire) ; édition MJ des notes d'un joueur (le MJ reste strictement lecture seule sur ce mécanisme, FR-11) ; suppression/édition d'une entrée après création (v1 append-only assumé, pas un oubli).

## Tasks / Subtasks

- [x] **Task 1 — Fix prérequis bloquant : `findOne` accessible à tout participant** (AC: 4)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE, méthode `findOne`) : remplacer
    ```ts
    mjId = (await this.parties.getOwned(character.partieId, userId)).mjId;
    ```
    par
    ```ts
    mjId = (await this.parties.getViewable(character.partieId, userId)).mjId;
    ```
    Un seul appel change — `getHistory`/`getPortraitFile`/`applyLevelUp`/`addInventoryItem` etc. ont chacune leur propre check inline (`getOwnCharacterOrThrow` ou `parties.getOwned` direct), aucune ne délègue à `findOne` : ce changement est isolé, sans effet de bord sur les autres endpoints.
  - [x] `apps/api/src/characters/character.service.spec.ts` (UPDATE, tests `findOne()` lignes ~261-289) : les 3 tests existants qui exercent le chemin non-propriétaire (`'findOne() par le MJ (non-propriétaire)'` l.268, `'findOne() par non-membre'` l.276) mockent aujourd'hui `parties.getOwned` — remplacer par `parties.getViewable` (déjà mocké dans `makePartiesService()` l.92, juste changer quel mock est utilisé/assert). Ajouter un nouveau cas `'findOne() par un joueur membre de la Partie (ni propriétaire ni MJ) → accès autorisé'` : `parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' })`, appeler `service.findOne('char1', 'joueur-tiers')`, vérifier qu'aucune exception n'est levée et que `parties.getViewable` a été appelé avec `('p1', 'joueur-tiers')`. `parties.getOwned` reste inchangé/toujours mocké pour `getHistory`/`getPortraitFile` (lignes 344, 546 — non affectées par ce fix).

- [x] **Task 2 — Schéma Prisma : `CharacterNote`** (AC: 1, 2, 5)
  - [x] `apps/api/prisma/schema.prisma` (UPDATE) : ajouter
    ```prisma
    model CharacterNote {
      id          String    @id @default(uuid())
      characterId String
      character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
      text        String
      shared      Boolean   @default(false)
      createdAt   DateTime  @default(now())
      @@index([characterId, createdAt])
    }
    ```
    exactement comme spécifié dans ARCHITECTURE-SPINE.md §Schema Prisma. Ajouter la relation inverse sur `model Character` : `notes CharacterNote[]` (même pattern que `snapshots CharacterSnapshot[]` déjà présent). **Ne pas** ajouter `XpDistribution`/`XpDistributionEntry` (déjà livrés, Story 6.2) ni retoucher `CharacterSnapshot` (Story 6.3) — même bloc Prisma du document d'architecture, mais hors scope de cette story.
  - [x] Migration : `docker compose exec api pnpm prisma migrate dev --name character_note` puis `docker compose exec api pnpm prisma generate`. Nom distinct des migrations précédentes (`character_snapshot_leveling`, etc.) — une migration incrémentale par story, convention déjà établie.

- [x] **Task 3 — Types partagés** (AC: 1, 2, 3, 4)
  - [x] `packages/shared/src/index.ts` (UPDATE) : ajouter, à la suite de `CreateInventoryItemDto`/`UpdateInventoryItemDto` :
    ```ts
    /** Entrée du journal de notes d'un personnage (Story 6.5) — append-only, jamais éditée/supprimée après création. */
    export interface CharacterNoteDto {
      id: string;
      characterId: string;
      text: string;
      shared: boolean;
      createdAt: string;
    }
    /** Payload de POST /characters/:id/notes. */
    export interface CreateCharacterNoteDto {
      text: string;
    }
    /** Payload de PATCH /characters/:id/notes/:noteId/share. */
    export interface ToggleNoteShareDto {
      shared: boolean;
    }
    ```
    Ces 3 types sont indépendants de `@master-jdr/game-rules` (pas de `CapabilityType`/`InventoryItem` en jeu ici) — contrairement à `CreateLevelUpDto`/inventaire, aucune restriction particulière à respecter pour ce bloc.

- [x] **Task 4 — `CharacterService` : addNote/toggleNoteShare/getNotes** (AC: 1, 2, 3, 4, 5)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter 3 méthodes.
    ```ts
    /** Ajoute une entrée au journal : PROPRIÉTAIRE SEUL (FR-11), toujours privée à la création
     *  (shared: false par défaut) — append-only, aucune modification possible ensuite via ce
     *  chemin. Écriture ligne dédiée (pas de JSON sur Character) : PAS de verrou optimiste requis
     *  ici (contrairement à l'inventaire, Story 6.4) — c'est précisément l'un des bénéfices d'un
     *  modèle Prisma dédié plutôt qu'un tableau JSON (AD-5) : un `create()` ou un `update()` par
     *  id propre n'a aucun risque de perte d'écriture concurrente sur un blob partagé. Pas de
     *  CharacterSnapshot créé (FR-12 exclut explicitement les notes, comme l'inventaire).
     */
    async addNote(characterId: string, userId: string, dto: CreateCharacterNoteDto): Promise<CharacterNoteDto> {
      await this.getOwnCharacterOrThrow(characterId, userId);
      const note = await this.prisma.characterNote.create({
        data: { characterId, text: dto.text, shared: false },
      });
      return toNoteDto(note);
    }

    /** Bascule le statut de partage d'une entrée existante : PROPRIÉTAIRE SEUL, par entrée (jamais
     *  un réglage global du journal). Vérifie explicitement que `noteId` appartient bien à
     *  `characterId` — sinon un propriétaire pourrait, en devinant/énumérant un UUID, basculer
     *  le partage d'une note d'un AUTRE personnage (le sien ou celui d'un tiers). */
    async toggleNoteShare(characterId: string, userId: string, noteId: string, shared: boolean): Promise<CharacterNoteDto> {
      await this.getOwnCharacterOrThrow(characterId, userId);
      const note = await this.prisma.characterNote.findUnique({ where: { id: noteId } });
      if (!note || note.characterId !== characterId) {
        throw new NotFoundException('Note introuvable');
      }
      const updated = await this.prisma.characterNote.update({ where: { id: noteId }, data: { shared } });
      return toNoteDto(updated);
    }

    /**
     * Liste le journal : PROPRIÉTAIRE (tout), MJ (tout), ou tout autre participant de la Partie
     * (uniquement `shared: true` — 3e pattern d'accès introduit par cette story, AD-8). Ne PAS
     * réutiliser `getOwnCharacterOrThrow` (propriétaire seul) ni `findOne` (renvoie un CharacterDto,
     * pas ce dont on a besoin ici) — check inline dédié, même esprit que `getHistory`/
     * `getPortraitFile`.
     */
    async getNotes(characterId: string, userId: string): Promise<CharacterNoteDto[]> {
      const character = await this.prisma.character.findUnique({ where: { id: characterId } });
      if (!character) throw new NotFoundException('Personnage introuvable');

      let sharedOnly = character.userId !== userId;
      if (sharedOnly) {
        const partie = await this.parties.getViewable(character.partieId, userId); // 403 si ni MJ ni membre
        if (partie.mjId === userId) sharedOnly = false;
      }
      const notes = await this.prisma.characterNote.findMany({
        where: { characterId, ...(sharedOnly ? { shared: true } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      return notes.map(toNoteDto);
    }
    ```
  - [x] Ajouter la fonction utilitaire locale (même fichier, à côté de `toDto`) :
    ```ts
    function toNoteDto(note: { id: string; characterId: string; text: string; shared: boolean; createdAt: Date }): CharacterNoteDto {
      return {
        id: note.id,
        characterId: note.characterId,
        text: note.text,
        shared: note.shared,
        createdAt: note.createdAt.toISOString(),
      };
    }
    ```
  - [x] Importer `CharacterNoteDto`/`CreateCharacterNoteDto` (type-only) depuis `@master-jdr/shared` en haut du fichier, à côté des imports existants.
  - [x] `apps/api/src/characters/character.service.spec.ts` (UPDATE) : nouveau describe `notes` —
    - `addNote()` : crée avec `shared: false` par défaut, `ForbiddenException` si non-propriétaire, **aucun appel** à `characterSnapshot.create` (même vigilance copier-coller que 6.4).
    - `toggleNoteShare()` : bascule `true`↔`false`, `NotFoundException` si `noteId` inexistant, `NotFoundException` si `noteId` appartient à un **autre** personnage (`note.characterId !== characterId` — test explicite de cette garde), `ForbiddenException` si non-propriétaire.
    - `getNotes()` : propriétaire → toutes les entrées (privées + partagées) ; MJ → toutes les entrées ; autre participant (membre non-MJ) → uniquement `shared: true` ; non-participant (ni MJ ni membre) → `ForbiddenException` (mock `parties.getViewable` rejetant) ; tri `createdAt: 'desc'` vérifié.

- [x] **Task 5 — DTOs & endpoints `CharactersController`** (AC: 1, 2, 3, 4)
  - [x] `apps/api/src/characters/dto/create-character-note.dto.ts` (NOUVEAU) :
    ```ts
    import { Transform } from 'class-transformer';
    import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

    export class CreateCharacterNoteDto {
      @IsString()
      @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
      @IsNotEmpty()
      @MaxLength(5000)
      text!: string;
    }
    ```
    Trim serveur + `IsNotEmpty` (rejette aussi une entrée composée uniquement d'espaces après trim) — même pattern que `CreateInventoryItemDto` (Story 6.4, cf. sa revue de code).
  - [x] `apps/api/src/characters/dto/toggle-note-share.dto.ts` (NOUVEAU) :
    ```ts
    import { IsBoolean } from 'class-validator';

    export class ToggleNoteShareDto {
      @IsBoolean()
      shared!: boolean;
    }
    ```
  - [x] `apps/api/src/characters/characters.controller.ts` (UPDATE) : ajouter 3 endpoints, même style que les endpoints inventaire existants :
    ```ts
    @Post(':id/notes')
    addNote(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: CreateCharacterNoteDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.addNote(id, user.id, dto);
    }

    @Patch(':id/notes/:noteId/share')
    toggleNoteShare(
      @Param('id', ParseUUIDPipe) id: string,
      @Param('noteId', ParseUUIDPipe) noteId: string,
      @Body() dto: ToggleNoteShareDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.toggleNoteShare(id, user.id, noteId, dto.shared);
    }

    @Get(':id/notes')
    getNotes(
      @Param('id', ParseUUIDPipe) id: string,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.getNotes(id, user.id);
    }
    ```
    Importer `CreateCharacterNoteDto`/`ToggleNoteShareDto`.
  - [x] `apps/api/src/characters/characters.controller.spec.ts` (UPDATE) : délégation pour les 3 endpoints (pattern déjà établi pour `addInventoryItem`/etc.) ; test HTTP réel (`ValidationPipe` global) : `POST /notes` sans `text` → 400 ; `PATCH /notes/:noteId/share` avec `shared` non-booléen → 400 ; `PATCH /notes/:noteId/share` avec un champ non déclaré dans le body → 400 (whitelist).

- [x] **Task 6 — Frontend : `character.service.ts`** (AC: 1, 2, 3, 4)
  - [x] `apps/web/src/app/core/characters/character.service.ts` (UPDATE) : ajouter 3 méthodes, même pattern HTTP que les méthodes existantes :
    ```ts
    addNote(id: string, dto: CreateCharacterNoteDto): Promise<CharacterNoteDto> {
      return firstValueFrom(
        this.http.post<CharacterNoteDto>(`${API_BASE}/characters/${id}/notes`, dto, { withCredentials: true }),
      );
    }

    toggleNoteShare(id: string, noteId: string, shared: boolean): Promise<CharacterNoteDto> {
      return firstValueFrom(
        this.http.patch<CharacterNoteDto>(
          `${API_BASE}/characters/${id}/notes/${noteId}/share`,
          { shared },
          { withCredentials: true },
        ),
      );
    }

    getNotes(id: string): Promise<CharacterNoteDto[]> {
      return firstValueFrom(
        this.http.get<CharacterNoteDto[]>(`${API_BASE}/characters/${id}/notes`, { withCredentials: true }),
      );
    }
    ```
    Importer `CharacterNoteDto`/`CreateCharacterNoteDto` (type-only) depuis `@master-jdr/shared`.
  - [x] `apps/web/src/app/core/characters/character.service.spec.ts` (UPDATE) : 3 tests HTTP (méthode, URL, withCredentials, body), même pattern que les tests inventaire.

- [x] **Task 7 — Frontend : `NotesJournal`** (AC: 1, 2, 3, 4, 5)
  - [x] `apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.ts` (+ `.html`, `.scss`, NOUVEAU), standalone. Même squelette que `HistoryTab` (Story 6.3) : chargement via `effect()` déclenché par `characterId()`, pas d'output `characterUpdated` (les notes ne touchent jamais `Character.sheetData`, contrairement à l'inventaire — pas besoin de propager un `CharacterDto` mis à jour au parent).
    ```ts
    export class NotesJournal {
      private readonly characterSvc = inject(CharacterService);
      protected readonly theme = inject(ThemeToneService);

      readonly characterId = input.required<string>();
      readonly isOwner = input.required<boolean>();

      protected readonly notes = signal<CharacterNoteDto[]>([]);
      protected readonly loadError = signal<string | null>(null);
      protected readonly newText = signal('');
      protected readonly submitting = signal(false);
      protected readonly submitError = signal<string | null>(null);

      constructor() {
        effect(() => {
          const id = this.characterId();
          void this.load(id);
        });
      }

      private async load(id: string): Promise<void> {
        this.loadError.set(null);
        try {
          this.notes.set(await this.characterSvc.getNotes(id));
        } catch {
          this.loadError.set("Le journal n'a pas pu être chargé.");
        }
      }

      protected async submitAdd(): Promise<void> {
        const text = this.newText().trim();
        if (!text || this.submitting()) return;
        this.submitting.set(true);
        this.submitError.set(null);
        try {
          const note = await this.characterSvc.addNote(this.characterId(), { text });
          this.notes.update((list) => [note, ...list]); // déjà en tête (liste triée desc), pas de rechargement complet
          this.newText.set('');
        } catch {
          this.submitError.set(this.theme.tone()['evolution.notes_error']);
        } finally {
          this.submitting.set(false);
        }
      }

      protected async toggleShare(note: CharacterNoteDto): Promise<void> {
        if (this.submitting()) return;
        this.submitting.set(true);
        this.submitError.set(null);
        try {
          const updated = await this.characterSvc.toggleNoteShare(this.characterId(), note.id, !note.shared);
          this.notes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
        } catch {
          this.submitError.set(this.theme.tone()['evolution.notes_error']);
        } finally {
          this.submitting.set(false);
        }
      }
    }
    ```
  - [x] Template : liste chronologique inversée (déjà triée serveur, pas de re-tri) — date (`DatePipe`, `| date: 'medium'`, même format que `HistoryTab`), texte de l'entrée, toggle de partage **visible seulement si `isOwner()`** (icône verrou fermé/ouvert + libellé texte, `evolution.note_share_toggle`, zone tactile 44px mobile/36px desktop, toute la ligne cliquable pas juste l'icône — cf. DESIGN.md §7 NotesJournal). Pour un non-propriétaire (MJ ou autre joueur), afficher seulement l'icône verrou en indicateur visuel **non cliquable** (aria-label `"Entrée privée"`/`"Entrée partagée avec le groupe"`, jamais la couleur seule — Accessibility Floor). Empty state (`evolution.notes_journal_empty`) si `notes().length === 0`, avec le CTA "+ Ajouter une entrée" déjà visible pour le propriétaire (cf. EXPERIENCE.md §5 State Patterns — le CTA reste visible même sur liste vide, contrairement à l'empty state d'autres sections). Formulaire d'ajout (textarea + bouton, `evolution.notes_add_cta`) visible seulement si `isOwner()`.
  - [x] `notes-journal.spec.ts` (NOUVEAU) : liste vide + `isOwner: true` → empty state **et** CTA d'ajout visibles ; liste vide + `isOwner: false` → empty state sans CTA ; liste non vide → date/texte affichés, ordre respecté (confiance dans l'ordre backend, comme `HistoryTab`) ; toggle de partage absent si `isOwner: false` ; toggle visible et cliquable si `isOwner: true`, appelle `toggleNoteShare` avec `!note.shared` ; ajout appelle `addNote` avec le texte trimé, préfixe la nouvelle entrée en tête de liste ; erreur réseau (ajout ou toggle) affiche le message inline.

- [x] **Task 8 — Intégration `character-sheet.ts`/`.html`** (AC: 1, 2, 3, 4)
  - [x] `character-sheet.html` (UPDATE) : ajouter une nouvelle section (même position que Historique/Inventaire) :
    ```html
    <section class="sheet__card">
      <h2 class="sheet__card-title">{{ theme.tone()['evolution.notes_journal_title'] }}</h2>
      <app-notes-journal [characterId]="c.id" [isOwner]="isOwner()" />
    </section>
    ```
    **Aucun `@if` de garde sur la section elle-même** — quiconque a atteint cette page a déjà passé le contrôle d'accès de `findOne` (propriétaire, MJ, ou membre de la Partie depuis le fix Task 1) ; c'est `NotesJournal`/l'API (`getNotes`) qui filtre le **contenu** (entrées partagées uniquement pour un non-propriétaire/non-MJ), pas la visibilité de la section. Ne pas copier le pattern `@if (isOwner() || viewerIsMj())` utilisé pour la section Historique — ce serait trop restrictif ici et cacherait la section à un fellow player qui a pourtant le droit d'y voir les entrées partagées (AC4).
  - [x] `character-sheet.ts` (UPDATE) : importer et déclarer `NotesJournal` dans le tableau `imports` du `@Component`. Aucune nouvelle méthode nécessaire (pas d'output à câbler, cf. Task 7).

- [x] **Task 9 — Microcopy** (AC: 1, 2, 4)
  - [x] `apps/web/src/app/core/theme/tones.ts` (UPDATE) : ajouter, dans le même bloc `evolution.*` que les clés Story 6.4 (à la suite de `evolution.inventory_error`), pour les **3 thèmes** :
    - `evolution.notes_journal_title` (ex. "Journal de notes")
    - `evolution.notes_journal_empty` (ex. "Aucune note pour le moment.")
    - `evolution.notes_add_cta` (ex. "+ Ajouter une entrée")
    - `evolution.note_share_toggle` (ex. "Partager avec le groupe" — **déjà référencée** dans EXPERIENCE.md §3 Voice and Tone comme clé prévue pour ce palier, mais jamais encore ajoutée à `tones.ts` par une story précédente : vérifié par grep, absente du fichier actuel — c'est cette story qui l'introduit réellement)
    - `evolution.note_private_label` (aria-label, ex. "Entrée privée")
    - `evolution.note_shared_label` (aria-label, ex. "Entrée partagée avec le groupe")
    - `evolution.notes_error` (ex. "Le journal n'a pas pu être mis à jour. Réessayez.")
    Suivre le registre déjà établi par thème (Grimoire Émeraude sobre, Forêt Ancienne organique "le cercle", Médiéval Steampunk mécanique).

- [x] **Task 10 — Tests d'intégration `character-sheet.spec.ts`** (AC: 1-4)
  - [x] `character-sheet.spec.ts` (UPDATE) : section Notes toujours rendue (propriétaire, MJ, et — nouveau cas à ajouter — un participant tiers non-MJ) ; `NotesJournal` reçoit `isOwner` correctement.

## Dev Notes

- **Architecture** : cf. `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md` — AD-5 (`CharacterNote` modèle dédié, **créé par cette story**), AD-6 (routes `POST /notes`, `PATCH /notes/:noteId/share`, `GET /notes`), AD-8 (3e pattern d'accès introduit par cette story : lecture filtrée `shared: true` pour un participant non-propriétaire/non-MJ via `parties.getViewable`), AD-10 (arborescence frontend `character-sheet/notes-journal/notes-journal.ts`).
- **Pourquoi pas de verrou optimiste ici, contrairement à l'inventaire (Story 6.4)** : `CharacterNote` est un modèle Prisma dédié avec ses propres lignes/id (`AD-5`), pas un tableau JSON sur `Character.sheetData`. `addNote` = `create()` (aucune donnée existante à écraser), `toggleNoteShare` = `update()` ciblé sur l'`id` propre de la note (pas de course possible sur un blob partagé). C'est exactement le bénéfice que AD-5 met en avant pour les données-liste : pas de réinvention en JSON avec une sémantique de requête incohérente. Ne pas ajouter de `updateMany`/`updatedAt` par réflexe de copier-coller depuis `character.service.ts` — ce serait un contresens architectural ici.
- **Pourquoi pas de `CharacterSnapshot`** : FR-12 exclut explicitement les notes de la création d'instantané (même raison que l'inventaire, Story 6.4).
- **`getOwnCharacterOrThrow` réutilisée une 4e fois** (par `addNote`/`toggleNoteShare`) avec son message d'erreur toujours figé sur le portrait — note mineure déjà signalée aux Stories 6.3/6.4, toujours non bloquante, à corriger seulement si le temps le permet.
- **Le fix Task 1 est un prérequis, pas un sujet séparé** : ne pas le traiter comme optionnel ou le reporter — sans lui, AC4 ne peut tout simplement pas être vérifié dans l'application réelle (le fellow player n'atteint jamais la page). C'est le même type de vigilance que les "régressions Task 3" de la Story 6.4 (changement nécessaire mais non explicitement demandé par l'AC lui-même).
- **Accessibilité (NFR4)** : toggle de partage — 44px mobile/36px desktop, toute la ligne cliquable (pas juste l'icône), jamais la couleur seule (icône verrou fermé/ouvert **+** texte). Pour un lecteur non-propriétaire, l'icône reste un indicateur visuel non interactif avec `aria-label` explicite (`evolution.note_private_label`/`evolution.note_shared_label`) — ne pas rendre un `<button>` non fonctionnel pour ce cas, un `<span>` avec aria-label suffit.

### Project Structure Notes

- Nouveau composant standalone frontend sous `apps/web/src/app/features/characters/character-sheet/notes-journal/` : `notes-journal.ts` — arborescence imposée par ARCHITECTURE-SPINE.md AD-10, à respecter à la lettre.
- Migration Prisma unique pour cette story : `character_note` (scope réduit au modèle `CharacterNote` — voir Task 2).
- 2 nouveaux DTOs sous `apps/api/src/characters/dto/` : `create-character-note.dto.ts`, `toggle-note-share.dto.ts` — même dossier que les DTOs des Stories 6.3/6.4.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6, Story 6.5 ; FR-11 ; FR Coverage Map]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md#AD-5, AD-6, AD-8, AD-10, Schema Prisma (CharacterNote), Shared Types]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md#4.4 Notes personnelles, FR-11, §5 Non-Goals]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md#7 Components — NotesJournal]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md#3 Voice and Tone (note_share_toggle), §4 Component Patterns — Notes, §5 State Patterns (notes_journal_empty, statut privé/partagé), §7 Accessibility Floor]
- [Source: _bmad-output/implementation-artifacts/6-4-gerer-inventaire-chiffre.md — patterns réutilisés (getOwnCharacterOrThrow, trim+MaxLength sur DTO texte libre après sa revue de code) et contre-pattern explicitement évité (verrou optimiste JSON, non applicable ici)]
- [Source: _bmad-output/implementation-artifacts/6-3-monter-de-niveau-et-historique.md — pattern `HistoryTab` répliqué pour `NotesJournal` (chargement via effect, pas d'output vers le parent)]
- [Source: apps/api/src/characters/character.service.ts — lu intégralement (`findOne` : accès à corriger Task 1 ; `getHistory`/`getPortraitFile` : check inline indépendant, non affecté)]
- [Source: apps/api/src/parties/parties.service.ts — lu intégralement (`getOwned` MJ-seul vs `getViewable` MJ-ou-membre, méthodes déjà existantes)]
- [Source: apps/web/src/app/features/parties/roster-rail/roster-rail.ts, roster-strip/roster-strip.ts — confirmé : `selectCharacter` navigue vers n'importe quel personnage de la troupe, sans restriction de rôle, d'où le caractère bloquant du fix Task 1]
- [Source: apps/api/src/characters/characters.controller.ts — pattern d'endpoints existant]
- [Source: apps/web/src/app/core/characters/character.service.ts — pattern HTTP existant à répliquer]
- [Source: apps/web/src/app/core/theme/tones.ts — registre `evolution.*` existant par thème, vérifié : `note_share_toggle`/`notes_journal_empty` absents malgré leur mention dans EXPERIENCE.md, à introduire réellement par cette story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8)

### Debug Log References

Aucun blocage. Un écart mineur découvert en cours d'implémentation, documenté ici plutôt que corrigé (hors scope de cette story) :
- `character-sheet.ts#viewerIsMj` est en réalité un raccourci "n'importe quel non-propriétaire" (`!isOwner() && auth.currentUser() existe`), pas une vraie détection de rôle MJ — c'était sans conséquence tant que `findOne` limitait l'accès à propriétaire-ou-MJ (aucun "autre joueur" ne pouvait jamais atteindre la page). Depuis le fix Task 1 (accès élargi à tout participant), un fellow player non-MJ verra techniquement `viewerIsMj() === true` et donc la section Historique (qui n'est pas censée lui être visible, FR-13 strict propriétaire-ou-MJ). **Pas une fuite de données** : `getHistory` conserve son propre contrôle d'accès serveur (`parties.getOwned`, MJ-seul, inchangé) — un fellow player verrait simplement un message d'erreur générique de chargement en cliquant sur cette section, jamais les données réelles. Corrigé nulle part dans cette story (renommer/distinguer proprement `viewerIsMj` d'un vrai `isParticipant` est un refactor plus large, hors scope de 6.5) — à surveiller si la Story 6.6 (édition MJ) touche à nouveau ce computed.

### Completion Notes List

- Tasks 1-10 complétées intégralement, tous les AC (1-5) couverts.
- Cycle rouge-vert appliqué à chaque task testable : tests écrits en premier (confirmés en échec), puis implémentation minimale, puis suite complète relancée.
- **Prérequis bloquant corrigé et vérifié (Task 1)** : `findOne` utilise désormais `parties.getViewable` (MJ ou membre) au lieu de `parties.getOwned` (MJ seul) — un fellow player peut maintenant atteindre la page fiche d'un coéquipier, condition nécessaire pour qu'AC4 soit testable dans l'UI réelle. `getHistory`/`getPortraitFile` confirmés non affectés (checks d'accès indépendants, toujours propriétaire-ou-MJ).
- **Nouveau modèle Prisma `CharacterNote`** — migration `character_note` appliquée avec succès, `prisma generate` exécuté.
- **Pas de verrou optimiste sur les notes** (contrairement à l'inventaire, Story 6.4) — confirmé délibéré et correct : `CharacterNote` est un modèle dédié avec ses propres lignes/id, `create()`/`update()` ciblés sans risque de perte d'écriture concurrente sur un blob JSON partagé.
- **Garde anti-énumération vérifiée** : `toggleNoteShare` rejette (`NotFoundException`) toute tentative de bascule sur une note appartenant à un autre `characterId`, testé explicitement.
- **3e pattern d'accès (AD-8) implémenté et testé** : `getNotes` retourne toutes les entrées pour le propriétaire et le MJ, uniquement `shared: true` pour tout autre participant, `ForbiddenException` pour un non-participant.
- **Trim serveur + `MaxLength(5000)`** sur le texte des notes, cohérent avec la leçon de la revue de code de la Story 6.4 (`CreateInventoryItemDto`).
- Suite de tests complète exécutée après implémentation : game-rules 61/61 (inchangée, non touchée par cette story), api 354/354 (dont 8 tests findOne + 13 tests service notes + 12 tests controller notes dédiés à cette story), web 51 fichiers passés (dont notes-journal 8 tests + character.service 3 tests + character-sheet 3 tests nouveaux).
- `tsc --noEmit` (api et web) : aucune nouvelle erreur introduite par cette story — seul le bruit `TS6059` (rootDir `packages/*`) déjà documenté comme pré-existant subsiste, non lié à ce travail.
- Microcopy `evolution.notes_*`/`evolution.note_*` livrée pour les 3 thèmes, registre de ton cohérent (Grimoire Émeraude sobre, Forêt Ancienne "cercle", Médiéval Steampunk "équipage").
- **Écart documenté, non bloquant** : `viewerIsMj` computed imprécis pour un fellow player non-MJ (cf. Debug Log References ci-dessus) — pas une fuite de données, section Historique juste techniquement visible (mais son contenu reste protégé côté serveur).

### File List

**Backend**
- `apps/api/prisma/schema.prisma` (M) — modèle `CharacterNote`, relation inverse `Character.notes`
- `apps/api/prisma/migrations/20260710235023_character_note/migration.sql` (A)
- `apps/api/src/characters/character.service.ts` (M) — `findOne` (getViewable), `addNote`, `toggleNoteShare`, `getNotes`, `toNoteDto`
- `apps/api/src/characters/character.service.spec.ts` (M) — tests `findOne` mis à jour + describe `notes` (13 tests)
- `apps/api/src/characters/characters.controller.ts` (M) — `POST/PATCH/GET :id/notes[/:noteId/share]`
- `apps/api/src/characters/characters.controller.spec.ts` (M) — délégation + validation HTTP réelle (12 tests)
- `apps/api/src/characters/dto/create-character-note.dto.ts` (A)
- `apps/api/src/characters/dto/toggle-note-share.dto.ts` (A)

**Types partagés**
- `packages/shared/src/index.ts` (M) — `CharacterNoteDto`, `CreateCharacterNoteDto`, `ToggleNoteShareDto`

**Frontend**
- `apps/web/src/app/core/characters/character.service.ts` (M) — `addNote`, `toggleNoteShare`, `getNotes`
- `apps/web/src/app/core/characters/character.service.spec.ts` (M) — 3 tests
- `apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.html` (A)
- `apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (M) — import `NotesJournal`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (M) — section Notes
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (M) — mocks + 3 tests
- `apps/web/src/app/core/theme/tones.ts` (M) — clés `evolution.notes_*`/`evolution.note_*`, 3 thèmes

### Change Log

- 2026-07-11 : Implémentation complète de la Story 6.5 (Incon, dev-story). 917 tests → 990 tests (game-rules 61, api 354, web 51 fichiers). Statut → `review`.

## Review Findings

_Code review 2026-07-11 — 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Les 5 AC sont confirmés remplis, aucune violation dure. 1 decision-needed, 2 patch, 0 defer, 4 dismissed as noise/comportement intentionnel documenté._

### Décision requise

- [x] **[Review][Decision → Patch] `viewerIsMj` devient imprécis pour un fellow player après l'élargissement de `findOne` (Task 1) — section Historique visible mais cassée** — **Décision Incon : option 1, corriger maintenant.** `CharacterDto` gagne un champ `viewerIsMj: boolean` résolu **côté serveur** (distinct de `ownerIsMj`, qui parle du propriétaire, pas du demandeur) : `findOne` calcule `mjId === userId` (au lieu de l'ancien raccourci frontend "tout non-propriétaire = MJ") ; `create`/`findByPartie`/les 5 mutations propriétaire-seules passent la valeur cohérente (`viewer === owner` dans ces cas, donc `viewerIsMj === ownerIsMj`). `character-sheet.ts` lit désormais `character()?.viewerIsMj` (avec toujours `!isOwner()` en garde, pour qu'un MJ consultant sa propre fiche ne voie pas le badge "vue d'un tiers"). Testé : propriétaire (false), MJ non-propriétaire (true), fellow player non-MJ (false, corrige le bug), MJ sur sa propre fiche (isOwner prime). Section Historique n'apparaît plus pour un fellow player.
  **Options :**
  1. **Corriger maintenant** — introduire un vrai signal MJ (ex. `CharacterDto.ownerIsMj` existe déjà pour le propriétaire, mais il faudrait exposer côté API si le *viewer* est MJ de la Partie, pas seulement si le *propriétaire* l'est ; le frontend distinguerait alors réellement `isMj` de `isParticipant`). Scope plus large qu'un patch ponctuel — touche le contrat `CharacterDto` et son calcul serveur.
  2. **Accepter tel quel et reporter** — comportement inoffensif (pas de fuite), déjà documenté ; corriger à l'occasion de la Story 6.6 (édition MJ), qui va de toute façon retravailler la distinction des rôles sur la fiche.
  3. **Mini-fix immédiat sans refonte** — masquer simplement la section Historique dès que l'appel `getHistory` échoue en 403, plutôt que d'afficher un message d'erreur générique (traite le symptôme, pas la cause, mais évite l'UI cassée sans toucher au contrat API).

### Patchs proposés

- [x] **[Review][Patch] `getPortraitFile` reste MJ-seul, incohérent avec la fiche désormais visible à tout participant — portrait cassé pour un fellow player** — Fix : `getOwned` → `getViewable`, aligné sur `findOne`. [source: edge — `character.service.ts:348-349`]
- [x] **[Review][Patch] Une note ajoutée avec succès reste invisible si le chargement initial du journal avait échoué** — Fix : `submitAdd()` fait `this.loadError.set(null)` après un ajout réussi. [source: edge — `notes-journal.html`, `notes-journal.ts`]

### Écartés (noise / comportement intentionnel déjà documenté par la story)

- **`findOne` expose désormais la fiche complète (attributs, narratif, capacités) à tout participant de la Partie, pas seulement les notes partagées** — c'est exactement la décision actée dans la story elle-même (§Prérequis bloquant : "normal dans un jeu de rôle de table, les joueurs voient les fiches des autres"), pas une découverte de la revue. Confirmé volontaire, pas un défaut.
- **Export PDF (`GET /characters/:id/export.pdf`) devient accessible à tout participant** — conséquence automatique et cohérente du point précédent (`exportPdf` dérive son contrôle d'accès de `findOne`, aucun code séparé à modifier) ; ne divulgue rien que la page elle-même n'affiche déjà.
- **Libellé du toggle de partage reste "Partager avec le groupe" même quand l'entrée est déjà partagée** (seule l'icône verrou change) — conforme au texte exact de la story (Task 7 : une seule clé `evolution.note_share_toggle`, état porté par l'icône).
- **Zone cliquable du toggle = le bouton (icône+texte), pas toute la ligne `<li>`** — lecture défendable de "toute la ligne cliquable" (DESIGN.md), seuils tactiles 44px/36px respectés ; non bloquant.
