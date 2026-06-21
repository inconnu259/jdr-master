# master-jdr

Plateforme web **open source** de gestion de parties de jeu de rôle (multi-systèmes, MJ + joueurs).

- Vision : [docs/spec.md](docs/spec.md)
- Feuille de route : [docs/backlog.md](docs/backlog.md)
- Sécurité : [docs/security.md](docs/security.md) · Mémo manuel : [docs/checklist.md](docs/checklist.md)

## Démarrage rapide (une seule commande)

**Prérequis : Docker Desktop uniquement** (avec WSL2 sur Windows). **Pas besoin de Node** sur ta machine —
toute la chaîne d'outils est figée dans Docker.

```bash
cp .env.dev .env      # première fois seulement
docker compose up
```

- **Front (Angular)** → http://localhost:4200 — doit afficher **« API OK / DB OK »**
- **API (NestJS)** → http://localhost:3000/health

> Le premier lancement installe les dépendances et build (quelques minutes). Ensuite c'est rapide,
> avec **hot reload** sur le front et l'API.

## Stack

| Élément | Techno |
|---|---|
| Front | Angular 22 — `apps/web` |
| API | NestJS 11 + Prisma 7 — `apps/api` |
| Base | PostgreSQL 17 |
| Types partagés | `packages/shared` |
| Outillage | Monorepo pnpm, 100 % conteneurisé |

## Structure

```
master-jdr/
├─ apps/
│  ├─ api/        # NestJS 11 + Prisma (endpoint /health)
│  └─ web/        # Angular 22 (page qui appelle /health)
├─ packages/
│  └─ shared/     # types TypeScript partagés (@master-jdr/shared)
├─ docs/          # spec, backlog, sécurité, checklist
├─ docker-compose.yml
└─ .env.example
```

## Développement

- `docker compose up` lance **db + api + web** avec hot reload.
- Toutes les commandes (`pnpm`, `prisma`, `ng`) se lancent **dans les conteneurs** — rien sur l'hôte.
  Ex. : `docker compose exec api pnpm prisma studio`.
- **Éditeur** : VS Code + extension **Dev Containers** (« Reopen in Container ») pour bénéficier des
  outils figés (autocomplétion, lint) sans rien installer.

## Versions épinglées

Node 24 LTS · pnpm 11.8 · Angular 22 · NestJS 11 · Prisma 7 · PostgreSQL 17.
