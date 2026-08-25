# Sécurité — modèle de menaces & checklist (master-jdr)

> **Statut : v0.1 — vivant.** Sécurité = transversale : on coche les items au fil des paliers.
> Mémo des actions *manuelles* à ne pas oublier : `docs/checklist.md`.

## Contexte & menaces

App web **avec login**, **auto-hébergée sur un Raspberry Pi**. Principales menaces :

- **Brute-force / credential stuffing** sur le login.
- **Réseau maison exposé** (ports ouverts, IP perso visible).
- **Failles de dépendances** (CVE) et **supply-chain** (paquet malveillant).
- **Fuite de secrets** (clés, mots de passe en clair, `.env` committé).
- **Injection / XSS / CSRF**, élévation de privilèges (un joueur accède aux données d'un autre / du MJ).

## Principes

Defense-in-depth · moindre privilège · **secure by default** · ne jamais faire confiance à l'entrée client ·
isolation des données par utilisateur/partie (un joueur ne voit que ses persos).

## Checklist par couche

### Authentification (dès le palier auth)
- [ ] Mots de passe hachés avec **argon2** (ou bcrypt) — jamais en clair.
- [ ] **Rate-limiting** sur `/login` (`@nestjs/throttler`) + verrouillage après N échecs.
- [ ] Cookies de session **HttpOnly + Secure + SameSite=Lax/Strict** (préférable à un token en localStorage).
- [ ] Politique de mot de passe minimale ; (option) vérification d'e-mail.
- [ ] Secrets de signature (JWT/session) **longs, aléatoires, hors du code**.

### API (NestJS)
- [ ] **Helmet** (en-têtes de sécurité) activé.
- [ ] **CORS** verrouillé sur l'origine du front uniquement.
- [ ] **Validation** stricte des entrées (`class-validator` + `whitelist: true`, `forbidNonWhitelisted`).
- [ ] Requêtes via **Prisma** (paramétrées → pas d'injection SQL).
- [ ] **Autorisation** vérifiée à chaque accès (le MJ d'une partie ≠ un autre MJ ; un joueur ≠ ses voisins).
- [ ] Pas de **stack trace** ni détail interne renvoyé en prod.

### Front (Angular)
- [ ] S'appuyer sur l'**échappement automatique** d'Angular ; **jamais** `bypassSecurityTrust*` sans raison.
- [ ] **CSP** en place ; aucun secret côté front.

### Secrets & config
- [ ] `.env` **dans `.gitignore`**, `.env.example` committé (sans valeurs).
- [ ] **Validation des variables d'env** au démarrage (échec rapide si manquant).

### Dépendances
- [ ] **`pnpm audit`** régulier (via Docker).
- [ ] **Renovate** ou **Dependabot** : PR de mise à jour automatiques.
- [ ] (Option) **Socket** : détection de paquets malveillants.

### Conteneurs (Docker)
- [ ] Image **slim**, exécution en **utilisateur non-root**.
- [ ] **Aucun secret** dans l'image ; `.dockerignore` complet.
- [ ] **Trivy** : scan CVE des images (en CI).

### Infra (Raspberry Pi)
- [ ] **Cloudflare Tunnel** → **aucun port entrant ouvert**, IP perso masquée, TLS + WAF/DDoS.
- [ ] OS + Docker **à jour** ; sauvegardes de la base ; (option) fail2ban.

## Outils & quand les utiliser

| Outil | Quoi | Quand |
|---|---|---|
| **Semgrep** (plugin Claude Code) | SAST + supply-chain + secrets, scan **après chaque édition** | en continu |
| **`/security-review`** (skill) | revue sécu du diff par l'IA | **fin de chaque palier** |
| **CI** : CodeQL/Semgrep, Gitleaks, Trivy, Dependabot, action `claude-code-security-review` | barrières automatiques | sur chaque PR (repo GitHub) |

## Réflexe par tâche
Toute tâche touchant **auth / données / upload / autorisation** → lancer **`/security-review`** avant de clore,
et vérifier les items de couche concernés ci-dessus. (Semgrep, lui, scanne déjà en continu.)
