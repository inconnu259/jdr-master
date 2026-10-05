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
├─ .env.dev       # configuration de dev versionnée (à copier en .env)
└─ .env           # copie locale, non versionnée
```

## Développement

- `docker compose up` lance **db + api + web** avec hot reload.
- Toutes les commandes (`pnpm`, `prisma`, `ng`) se lancent **dans les conteneurs** — rien sur l'hôte.
  Ex. : `docker compose exec api pnpm prisma studio`.
- **Éditeur** : VS Code + extension **Dev Containers** (« Reopen in Container ») pour bénéficier des
  outils figés (autocomplétion, lint) sans rien installer.

## Données de démonstration

Un jeu de données de démo (comptes, parties, personnages, votes, invitations…) permet de tester
l'interface sans rien saisir. **Réservé au développement local**, jamais à la production. Toutes
les dates sont relatives au moment du seed.

Remise à zéro complète, **dans cet ordre** :

```bash
docker compose exec api pnpm exec prisma migrate reset --force   # base vide
docker compose exec api pnpm seed                                # compte admin (identifiants de .env)
docker compose restart api                                       # puis attendre « Nest application successfully started »
docker compose exec api pnpm seed:demo                           # données de démo
```

- Prisma 7 ne lance plus le seed après `migrate reset` : l'étape `pnpm seed` est manuelle.
- Le redémarrage de l'API est indispensable : c'est lui qui crée les systèmes de jeu (Ryuutama) dont
  le seed de démo dépend. Lancé trop tôt, `seed:demo` s'arrête avec un message explicite, sans
  rien écrire.
- Le seed de démo n'est pas idempotent : si les comptes de démo existent déjà, il ne fait rien.
- Les comptes de démo (et leurs particularités), les liens d'invitation et les liens à usage unique
  (réinitialisation de mot de passe, changement d'e-mail) sont affichés **dans la sortie console**
  du seed — c'est elle qui fait foi. Le compte admin utilise les identifiants `ADMIN_*` de `.env`.
- Les e-mails envoyés par l'application (invitations, rappels de séance, réinitialisation…) sont
  captés par **Mailpit** : http://localhost:8025.

## Versions épinglées

Node 24 LTS · pnpm 11.8 · Angular 22 · NestJS 11 · Prisma 7 · PostgreSQL 17.
