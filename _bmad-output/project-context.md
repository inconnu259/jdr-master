---
project_name: 'jdr-master'
user_name: 'Incon'
date: '2026-06-26'
sections_completed: ['technology_stack', 'project_overview']
existing_patterns_found: 12
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Project Overview

**jdr-master** is an open-source web platform for managing tabletop RPG sessions (multi-system, Game Master + players). 

**Key Documents:**
- Vision & specification: `docs/spec.md`
- Development roadmap: `docs/backlog.md`
- Security checklist: `docs/security.md`
- Manual checklist: `docs/checklist.md`

**Current Development Stage:** Tier 1 (authentication & core features). Completed phases: 1a (auth), 1b (game creation). Current work: 1c (invitations/joining).

---

## Technology Stack & Versions

### Core Runtime & Package Management
- **Node:** 24 LTS (pinned)
- **pnpm:** 11.8.0 (pinned, monorepo workspace)
- **Execution:** 100% Docker containerized — no Node tools on host machine
- **Database:** PostgreSQL 17

### Frontend
- **Framework:** Angular 22 (latest 2025 conventions)
- **Build Tool:** Vite (via `@angular/build`)
- **Testing:** Vitest 4.0.8
- **TypeScript:** 6.0.2
- **Styling:** Angular Material 22.0.2
- **Language Features:** Control-flow syntax (`@if`, `@for`), Signals for state

### Backend (API)
- **Framework:** NestJS 11.0.1
- **ORM:** Prisma 7.8.0 (with `prisma-client-js` legacy generator; migration to new generator + driver adapter planned for Tier 1)
- **Database Adapter:** `@prisma/adapter-pg` 7.8.0
- **Authentication:** Passport.js with local strategy, express-session
- **Security:** Helmet 8.2.0, argon2 0.44.0 (password hashing), @nestjs/throttler 6.5.0
- **Validation:** class-validator 0.15.1, class-transformer 0.5.1
- **Testing:** Jest 30.0.0 (API), Supertest 7.0.0 (E2E)
- **TypeScript:** 5.7.3
- **Linting:** ESLint 9.18.0, Prettier 3.4.2

### Shared Package
- **Purpose:** TypeScript type definitions shared between frontend and API
- **Convention:** Imported as `import type` (type-only imports, erased at runtime)
- **Package Name:** `@master-jdr/shared`
- **Module Type:** ES modules

---

## Code Organization & Naming Conventions

### Directory Structure
```
master-jdr/
├─ apps/
│  ├─ api/        # NestJS 11 backend
│  │  ├─ src/
│  │  │  ├─ auth/          # authentication module
│  │  │  ├─ users/         # user management
│  │  │  ├─ parties/       # game sessions
│  │  │  ├─ invitations/   # invitation system
│  │  │  ├─ common/        # shared decorators, guards
│  │  │  ├─ prisma/        # database service
│  │  │  └─ health/        # health check endpoint
│  │  └─ test/             # E2E tests
│  └─ web/        # Angular 22 frontend
│     └─ src/
│        ├─ app/
│        │  ├─ core/       # services, guards, logic
│        │  ├─ features/   # feature modules/pages
│        │  └─ layout/     # layout components
│        └─ main.ts
├─ packages/
│  └─ shared/     # TypeScript types (@master-jdr/shared)
├─ docs/          # specification, roadmap, security, checklists
└─ docker-compose.yml
```

### File Naming Conventions
- **Backend modules & services:** `kebab-case.ts` (e.g., `local.strategy.ts`, `authenticated.guard.ts`)
- **Angular components:** PascalCase in filenames (legacy; new files use lowercase component names in standalone syntax)
- **DTOs:** `*.dto.ts` suffix (e.g., `create-invitation.dto.ts`)
- **Guards:** `*.guard.ts` suffix
- **Strategies:** `*.strategy.ts` suffix
- **Services:** `*.service.ts` suffix
- **Controllers:** `*.controller.ts` suffix
- **Test files:** `*.spec.ts` suffix

### Import Conventions
- **Shared types:** Always use `import type` (type-only imports)
- **Path aliases:** Both backends use `baseUrl: "./"` for local path resolution
- **Workspace packages:** Referenced as `@master-jdr/shared` in package.json with `workspace:*` protocol

---

## Critical Implementation Rules

### 1. Execution & Development Workflow
- **NEVER** run Node tools directly on host — everything executes in Docker containers
- **Docker Compose Commands:**
  ```bash
  docker compose up              # Launch db + api + web with hot reload
  docker compose exec api pnpm <cmd>    # Run commands in API container
  docker compose exec web pnpm <cmd>    # Run commands in web container
  docker compose up --build      # Rebuild images after dependency changes
  ```
- **IDE Setup:** Use VS Code with Dev Containers extension (`Remote - Containers`) to reopen workspace in container for autocompletion and linting

### 2. TypeScript Configuration
- **API (NestJS):**
  - `strictNullChecks: true` — null/undefined handling is strict
  - `noImplicitAny: false` — implicit `any` is allowed (framework pattern)
  - `forceConsistentCasingInFileNames: true` — file paths must match case
  - `skipLibCheck: true` — skip type checking of node_modules
  - Decorators enabled: `experimentalDecorators: true`, `emitDecoratorMetadata: true`
  - Target: ES2023
- **Web (Angular):**
  - Target: ES2023 (via tsconfig.app.json)
  - Strict null checks enabled
  - Case-sensitive file resolution
- **Shared:**
  - Type definitions only — no runtime code

### 3. Backend (NestJS + Prisma)
- **Module Pattern:** All features use NestJS modules (controller + service + module)
- **DTO Pattern:** Use `class-validator` decorators for validation
  ```typescript
  export class CreateInvitationDto {
    @IsString()
    @IsNotEmpty()
    email: string;
  }
  ```
- **Service Injection:** NestJS dependency injection via constructor parameters
- **Guards:** Use custom guards (e.g., `LocalAuthGuard`, `AuthenticatedGuard`) for route protection
- **Database:** Prisma migrations required for schema changes; schema.prisma is source of truth
- **Session Management:** Express-session with PostgreSQL store (`connect-pg-simple`)
- **Authentication:** Passport.js local strategy with username/password (session-based)

### 4. Frontend (Angular 22)
- **Standalone Components:** New components should be standalone (not module-based)
- **Control Flow:** Use modern `@if`, `@for`, `@switch` syntax (not `*ngIf`, `*ngFor`)
- **State Management:** Signals for reactive state (not RxJS Subjects for new code)
- **Services:** Use Angular services for API calls and business logic
- **Testing:** Vitest configuration for unit tests; use `*.spec.ts` files
- **Routing:** Component-based routing with `app.routes.ts`

### 5. Shared Types Package (`@master-jdr/shared`)
- **Import Convention:** Always import as `import type { Type } from '@master-jdr/shared'` (type-only)
- **No Runtime Code:** Shared package contains **only** TypeScript type definitions
- **Package Exports:** Defined in `exports` field of package.json with explicit entry point

### 6. Architecture & Design Patterns
- **Plugin System:** Game systems are modular plugins; character sheets are schema-driven (see `docs/spec.md` §5)
- **Data-Driven Content:** Game mechanics and character sheet fields are defined by JSON schemas, not hardcoded
- **Multi-System Support:** The platform must support multiple RPG systems (D&D, Pathfinder, Call of Cthulhu, etc.)
- **Security-First:** See `docs/security.md` for complete checklist
  - Password hashing: argon2 (not bcrypt)
  - Rate limiting: @nestjs/throttler
  - Session security: Helmet middleware, secure cookie flags
  - Input validation: class-validator on all endpoints

### 7. Security & Hardening
- **API Middleware:** Helmet.js applied at app startup for security headers
- **Password Hashing:** argon2 library (0.44.0) for all new password-related operations
- **Rate Limiting:** @nestjs/throttler configured per endpoint
- **Input Validation:** All DTOs validated with class-validator
- **CORS:** Configured for development; tighten for production
- **Semgrep:** Continuous static analysis for security issues

### 8. Testing
- **Backend:** Jest with ts-jest transformer; test files live alongside source in `*.spec.ts`
- **Frontend:** Vitest; jsdom test environment
- **E2E:** Jest with Supertest for HTTP testing
- **Test Discovery:** Jest rootDir is `src/` — tests match `.**\.spec\.ts$` pattern

### 9. Linting & Formatting
- **Formatter:** Prettier 3.4.2 (shared config)
- **Linter:** ESLint 9.18.0 with Prettier integration (`eslint-plugin-prettier`)
- **Commands:**
  ```bash
  docker compose exec api pnpm lint       # Lint and auto-fix API
  docker compose exec web pnpm lint       # Lint and auto-fix web
  docker compose exec api pnpm format     # Format API code
  ```

### 10. Database & Migrations
- **Migrations:** Prisma migrations stored in `apps/api/prisma/migrations/`
- **Migration Naming:** Timestamp + descriptive slug (e.g., `20260626003517_invitations_1c`)
- **Workflow:**
  ```bash
  docker compose exec api pnpm prisma migrate dev --name <description>
  docker compose exec api pnpm prisma generate    # Regenerate Prisma client
  ```
- **Schema Location:** `apps/api/prisma/schema.prisma` — single source of truth for data model

### 11. Development Checklist (Tier Completion)
- **End of each tier:** Enter plan mode before non-trivial features
- **Before merge:** Run `/security-review` and `/code-review`
- **Dependency updates:** Review and merge PR updates to dependencies
- **Source of truth:** `docs/checklist.md`

### 12. MCP & Documentation Tools
- **Context7 MCP:** Use to fetch current documentation for Angular, NestJS, Prisma before writing framework-specific code (these frameworks evolve rapidly)
- **Always consult:** Before writing controller decorators, ORM queries, or lifecycle hooks

---

## Known Constraints & Patterns

- **Prisma Legacy Generator:** Currently using `prisma-client-js` legacy generator; newer `prisma-client` + driver adapter migration planned for Tier 1
- **Types Erased at Runtime:** Shared types are TypeScript-only; no runtime type information is available
- **Session-Based Auth:** Not token-based (JWT); Express-session with database store
- **First Draft Stage:** Project is in early development (Tier 1); architecture and patterns are being established

---

## Recommended Reading Order

1. `docs/spec.md` — Understand the vision and architecture
2. `docs/backlog.md` — See the development roadmap and feature tiers
3. `docs/palier-1.md` — Current tier specification (§7, §9, §11 are critical)
4. `docs/security.md` — Review security requirements
5. `CLAUDE.md` — Project-specific guidelines and reminders
