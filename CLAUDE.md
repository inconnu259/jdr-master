# CLAUDE.md — master-jdr

Plateforme web open source de gestion de parties de JDR (multi-systèmes, MJ + joueurs).
**Vision : `docs/spec.md` · Feuille de route : `docs/backlog.md`.** Lire ces deux fichiers en début de session.

Instructions agent versionnées, lues par tous les outils : `AGENTS.md`. Ce fichier-ci le
complète pour Claude Code — les deux se lisent ensemble, sans redite.

## Stack & structure

- Monorepo **pnpm**, **tout via Docker** (aucun outil Node sur l'hôte — voir `README.md`).
- `apps/web` : **Angular 22** (conventions 2025 : `app.ts`, control-flow `@if/@for`, signals ; test-runner Vitest).
- `apps/api` : **NestJS 11** + **Prisma 7** (générateur `prisma-client-js` legacy pour l'instant ;
  migration vers le nouveau générateur `prisma-client` + driver adapter prévue au palier 1).
- `packages/shared` : types **et** valeurs runtime partagés (`THEMES`, `GAME_SYSTEMS`,
  `CALENDAR_LAYER_KEYS`, `checkPartieKindTransition()`…). `import type` réservé aux types :
  sur une valeur il l'efface et casse à l'exécution.
- `packages/game-rules` : règles de jeu exécutables (Ryuutama) + leurs tests Vitest.
- Base : **PostgreSQL 17**.
- Versions épinglées : Node 24 LTS, pnpm 11.8, Angular 22, Nest 11, Prisma 7.

## ⛔ RÈGLE ABSOLUE — aucune installation de dépendance sans accord explicite

**Interdiction totale** d'exécuter, sur l'hôte comme dans un conteneur :
`npm install` / `npm i` / `npm ci` / `npm add` / `npx <paquet-non-installé>` /
`pnpm add` / `pnpm install` / `pnpm dlx` / `yarn add` / `bun add`, ni aucune modification de
`package.json` (dépendances) ou de `pnpm-lock.yaml`.

Raison : vagues de vers de supply-chain npm (Shai-Hulud / ChainDrop) — un seul `install` non
souhaité peut exécuter un `preinstall` malveillant qui exfiltre tokens npm/GitHub/cloud.

Si une dépendance manque : **s'arrêter et demander**. Ne jamais « débloquer » en installant.
Autorisé sans demander : `npx`/`pnpm exec` sur un binaire **déjà présent** dans `node_modules`
(eslint, jest, vitest, prettier, tsc…) — aucun téléchargement dans ce cas. Uniquement
**dans un conteneur** : l'hôte n'a aucun `node_modules`, ils vivent dans des volumes
Docker nommés (cf. `docker-compose.yml`).

## Commandes (toujours via Docker)

- Lancer : `docker compose up` (db + api + web, hot reload).
- Commande dans un service : `docker compose exec api pnpm <...>` / `docker compose exec web pnpm <...>`.
- Mon shell d'agent ne voit `docker` qu'après avoir rechargé le PATH depuis le registre
  (`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + ...`).

## Conventions

- **Architecture plugin** : systèmes de jeu modulaires, fiche **pilotée par un schéma** (spec §5).
  Penser modularité multi-système et contenu data-driven dès qu'on touche aux systèmes.
- **Sécurité** : checklist `docs/security.md` ; durcissement (argon2, throttler, Helmet,
  validation) dès le palier auth. La CI (`.github/workflows/ci.yml`) fait tourner lint, types,
  build et tests, mais **aucune analyse statique de sécurité** (pas de Semgrep) — cette revue-là
  passe par `/security-review`.
- **Langue du code** : ce dépôt déroge à la règle globale « code et commentaires en anglais ».
  Ici, commentaires et messages d'erreur sont **en français**, comme les ~5 200 lignes
  existantes. Ne pas introduire d'anglais, ne pas retraduire l'existant.
- **Temps réel (SSE)** : tout nouveau composant/page affichant des données scopées à une Partie
  (ou à l'utilisateur, cf. canal `user:{id}`) doit être évalué pour un besoin de câblage sur le
  signal `changed`/`notifyChanged()` du service de domaine concerné, propagé via `RealtimeService`
  (voir `docs/checklist.md`) — pas de garde automatisée (lint/CI), vérification humaine/agent à
  chaque ajout.

## ⚠️ Rappels à faire à l'utilisateur (il l'a explicitement demandé)

À la **fin de chaque palier** ou avant une **grosse feature**, lui rappeler :
- de passer en **mode plan** avant de coder du non-trivial ;
- de lancer **`/security-review`** (et `/code-review`) ;
- de relire / merger les PR de mise à jour de dépendances.

Source de vérité : `docs/checklist.md`.

## Outils

- **Context7** (MCP) : doc à jour des libs — l'utiliser **avant d'écrire du code framework-spécifique**
  (Angular/Nest/Prisma évoluent vite).
