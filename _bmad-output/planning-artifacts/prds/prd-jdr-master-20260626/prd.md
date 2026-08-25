---
title: "PRD — Palier 2 : Calendrier jdr-master"
status: final
created: 2026-06-26
updated: 2026-06-26
scope: personal / scope-1
---

# PRD — Palier 2 : Calendrier

## Contexte & problème

Trouver une date commune pour une soirée JDR est systématiquement pénible. Le MJ envoie un sondage (WhatsApp, Doodle), les joueurs répondent en ordre dispersé, et il faut recroiser manuellement les réponses. Avec 4-6 joueurs aux emplois du temps différents, ça prend plusieurs jours.

**L'insight clé** : au lieu de demander "quand êtes-vous disponibles ?" (oblige chacun à lister des créneaux positifs dans le vide), chacun déclare ses *indisponibilités* une fois — le système calcule automatiquement les créneaux où tout le monde est libre. Le MJ voit directement les dates possibles sans aucun sondage externe.

C'est différent de Doodle : Doodle = MJ devine des dates → vote. jdr-master = contraintes déclarées → système calcule → vote optionnel si ambiguïté.

**Scope de ce palier : scope-1** (usage perso du MJ + son groupe de confiance, instance Docker locale). Les décisions de design reflètent ce contexte : pas d'infra publique, groupe fermé, pas de modération. Le passage au scope-2 (instance cloud pour amis MJ) est conditionné au Palier 6 (notifications SMTP).

**Utilisateurs concernés :** MJ (1 par partie) + joueurs (3-6 par partie). Accès principalement mobile (soirées, pas au bureau).

---

## Objectif du palier

Permettre à un groupe de trouver la prochaine date de jeu sans outil externe de sondage (WhatsApp, Doodle, Discord, etc.), uniquement en s'appuyant sur les contraintes déclarées et un vote optionnel.

**Done when :** le MJ peut voir en un coup d'œil les 5 prochains créneaux où tout le monde est disponible, proposer une ou plusieurs de ces dates, et les joueurs peuvent voter — le tout sans quitter l'app.

---

## Fonctionnalités

### F1 — Déclaration de disponibilités

Chaque utilisateur (MJ ou joueur) déclare ses contraintes, accessibles depuis son profil, **globales** (valables pour toutes ses parties).

**FR-1.1 — Deux types de déclarations, cumulables**

| Type | Sens | Exemple |
|------|------|---------|
| **Indisponibilité** | "Je ne suis PAS dispo" | "Jamais le mercredi soir", "Vacances du 15 au 22 juillet" |
| **Disponibilité** | "Je SUIS dispo" | "Libre le lundi et mardi de ce mois-ci", "Ce samedi c'est bon" |

Chaque déclaration peut être **récurrente** (pattern jour + slot répété jusqu'à expiration) ou **ponctuelle** (plage de dates concrète), avec une **granularité** : journée entière, matin, après-midi ou soirée.

L'heure précise (ex : "indispo 19h-20h") est hors périmètre — voir section "Hors périmètre".

**FR-1.2 — Logique d'interprétation des zones vides**

Quand un utilisateur a déclaré des contraintes, les zones non mentionnées sont interprétées selon le contexte :

- **Période couverte** = l'union des plages temporelles de toutes les déclarations actives de l'utilisateur.
  - Déclaration *ponctuelle* : contribue `[startDate, endDate]` à la période couverte.
  - Déclaration *récurrente* : contribue `[today, expiresAt]` à la période couverte (la période démarre à aujourd'hui, pas à la date de création).
- Dans la période couverte : zone vide = **disponible** (inférence positive — s'il avait un conflit, il l'aurait déclaré).
- Hors de la période couverte : zone vide = **inconnu** (traité comme "peut-être" dans le calcul).
- Une déclaration de disponibilité explicite = **certain disponible** sur ce créneau.

*Exemple :* déclaration récurrente "jamais le mercredi soir" expirant dans 3 mois → période couverte = [aujourd'hui, +3 mois]. Un jeudi soir du mois 2 sans déclaration = **disponible** (pas "peut-être"), car dans la période couverte.

**FR-1.3 — Expiration obligatoire**

Toute déclaration a une date d'expiration. Défauts : 6 mois pour les récurrentes, date de fin explicite pour les ponctuelles. Aucune déclaration sans fin — évite les données périmées qui bloquent des dates indéfiniment.

Les déclarations expirées sont archivées (pas supprimées) — utiles pour les reconduire facilement.

Un indicateur visuel signale les déclarations qui expirent dans les 14 prochains jours.

**FR-1.4 — Import calendrier externe (iCal)**

Hors périmètre ce palier. Voir section "Hors périmètre".

---

### F2 — Calcul automatique des créneaux disponibles

Le système calcule les créneaux où l'ensemble des membres d'une partie sont disponibles.

**FR-2.1 — Calcul d'intersection**

Pour une partie donnée, le système agrège les déclarations de tous les membres (MJ + joueurs) et calcule les créneaux libres dans les N prochaines semaines (défaut : 8 semaines). Si aucun créneau n'est trouvé, un message guide l'utilisateur : *"Aucun créneau commun — élargissez la fenêtre ou révisez vos indispos."*

**FR-2.2 — Vue MJ : "prochaines dates possibles"**

Le MJ accède depuis la page détail de la partie à une vue listant les **5 prochains créneaux** où aucun membre n'est ❌ indisponible, triés par date, calculée à la demande.

*Cette vue répond directement à la question clé : le MJ voit les dates possibles sans lancer de vote ni de sondage externe.*

Un créneau = une journée + un slot (MORNING / AFTERNOON / EVENING / FULL_DAY).

**FR-2.3 — Statuts de disponibilité dans le calcul**

Pour chaque créneau, chaque membre reçoit un statut dérivé de ses déclarations via `AvailabilityService.computeSlotStatus(userId, date, slot)` :

| Statut | Signification | Couleur suggérée |
|--------|---------------|-----------------|
| ✅ **Disponible** | Déclaration positive explicite, ou zone vide dans période couverte | Vert |
| ❌ **Indisponible** | Déclaration d'indisponibilité couvre ce créneau | Rouge |
| ⚠️ **Inconnu** | Aucune déclaration, hors période couverte | Gris |

Un créneau apparaît dans la liste si **aucun membre n'est ❌**. Les membres ⚠️ inconnus sont signalés.

**FR-2.4 — Membres sans déclarations**

Si un membre est entièrement ⚠️ inconnu (aucune déclaration active), le MJ voit un indicateur "X membres sans données" — le créneau peut quand même apparaître, mais avec un avertissement de données incomplètes.

**FR-2.5 — Partie épisodique (pool)**

Hors périmètre ce palier (voir "Hors périmètre"). Pour l'instant, le calcul porte sur **tous les membres** quelle que soit la `PartieKind`.

---

### F3 — Vote sur une date

Le vote est une fonctionnalité **MUST** de ce palier. Son **usage** par le MJ est optionnel — il peut utiliser la vue F2 sans jamais lancer de vote. Il intervient quand plusieurs créneaux sont équivalents ou quand le MJ veut une validation explicite du groupe.

**FR-3.1 — Création d'un vote**

Le MJ sélectionne 2 à 4 dates candidates (depuis les créneaux calculés *ou* librement, y compris des dates hors créneaux si le MJ le décide) et crée un vote associé à la partie.

**FR-3.2 — Participation au vote**

Chaque membre répond pour chaque date : ✅ Dispo / ❌ Pas dispo / ⚠️ Peut-être.

Deadline optionnelle sur le vote (défaut : 7 jours). À la deadline, le vote se ferme automatiquement.

**FR-3.3 — Résultat du vote**

Le MJ voit le récapitulatif (✅ / ❌ / ⚠️ par date) et tranche manuellement la date finale. La date choisie est enregistrée comme "prochaine séance" sur la partie.

**FR-3.4 — Notifications in-app**

- Joueur notifié (badge / bandeau) quand un vote est ouvert sur une de ses parties.
- MJ notifié quand tous les membres ont répondu avant la deadline.
- Notifications email (SMTP) = hors périmètre ce palier, traitées au Palier 6.

**FR-3.5 — Un seul vote actif par partie à la fois**

Un seul vote `OPEN` à la fois par partie. Créer un nouveau vote ferme le précédent automatiquement. La contrainte est enforced en base via l'index `@@index([partieId, status])` et vérifiée dans le service avant création.

**FR-3.6 — Lien vote ↔ scénario**

`[SHOULD]` Un vote peut être associé à un libellé de scénario/séance (ex : "Séance 3 — Le Donjon de Fer") pour planifier plusieurs dates de campagne à l'avance. Champ texte libre au P2 ; liaison formelle avec le modèle `Session` arrivera au Palier 5.

---

### F4 — Intégration avec la page détail d'une partie

**FR-4.1 — Widget calendrier (vue MJ)**

La page détail d'une partie (MJ) affiche :
- La **prochaine date confirmée** (si définie).
- Un bouton **"Trouver une date"** → ouvre la vue créneaux calculés (F2).
- Le **vote en cours** (si actif) avec son état et le nombre de réponses.

**FR-4.2 — Vue joueur**

Le tableau de bord joueur affiche, pour chaque partie dont il est membre :
- La **prochaine date confirmée**.
- Un badge si un **vote est en attente de sa réponse**.

---

## API (esquisse NestJS)

```
# Déclarations de disponibilité (profil utilisateur)
GET    /availability                          → mes déclarations actives
POST   /availability                          → créer une déclaration
PATCH  /availability/:id                      → modifier
DELETE /availability/:id                      → supprimer (ou archiver)

# Calcul des créneaux (contexte partie)
GET    /parties/:id/available-slots           → 5 prochains créneaux libres
       ?weeks=8                               → fenêtre en semaines (défaut 8)

# Votes
GET    /parties/:id/poll                      → vote actif de la partie (ou null)
POST   /parties/:id/poll                      → créer un vote (MJ seulement)
DELETE /parties/:id/poll/:pollId              → fermer/annuler un vote (MJ)
POST   /parties/:id/poll/:pollId/vote         → répondre au vote (joueur ou MJ)
PATCH  /parties/:id/poll/:pollId/choose       → choisir la date finale (MJ)
```

Tous les endpoints nécessitent une session active (`AuthenticatedGuard`). Les actions MJ (`POST /poll`, `DELETE /poll`, `PATCH /choose`) vérifient que `req.user.id === partie.mjId`.

---

## Exigences non fonctionnelles

**NFR-1 — Mobile first.** L'interface de déclaration et de vote est conçue pour mobile (touch-friendly, pas de tableaux larges).

**NFR-2 — Performance du calcul.** `GET /parties/:id/available-slots` retourne un résultat en < 1s pour 6 membres sur 8 semaines.

**NFR-3 — Données cohérentes.** Un membre retiré d'une partie (Membership supprimé) est exclu du calcul des créneaux pour cette partie. Ses déclarations globales restent intactes.

---

## Ce qui est hors périmètre (ce palier)

- **Notifications email / SMTP** → Palier 6.
- **Import iCal + granularité horaire** → COULD, palier post-P5. Raison : un événement "19h-20h" ne mappe pas proprement sur un slot "soirée" sans conception dédiée de la granularité horaire.
- **Sync live Google Calendar / Apple Calendar** → COULD (OAuth2, hors MVP).
- **Calendrier type "agenda visuel"** (vue mois/semaine) → liste de créneaux calculés suffit pour le MVP.
- **Rappels automatiques de séance** → post-MVP.
- **Récurrence avancée** (ex : "tous les 2e vendredis du mois") → post-MVP.
- **Indispos par partie** (global uniquement pour l'instant) → évolution si besoin confirmé à l'usage.
- **N parmi M (parties épisodiques)** → avec Conte de Minuit, palier ultérieur.
- **Points ouverts P3+ du brainstorm** (hiérarchie plugins, validation MJ-override, visibilité granulaire session, messages secrets) → non traités ici, voir `brainstorm-intent.md §6`.

---

## Modèle de données (esquisse Prisma)

```prisma
enum DaySlot    { MORNING AFTERNOON EVENING FULL_DAY }
enum RecurKind  { RECURRING PUNCTUAL }
enum AvailKind  { UNAVAILABLE AVAILABLE }
enum PollStatus { OPEN CLOSED }
enum VoteAnswer { YES NO MAYBE }

model AvailabilityDeclaration {
  id          String     @id @default(uuid())
  userId      String
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  kind        AvailKind   // UNAVAILABLE ou AVAILABLE
  recurKind   RecurKind   // RECURRING (pattern hebdo) ou PUNCTUAL (plage de dates)

  // Récurrent : jour de la semaine (0=lun … 6=dim) + slot
  dayOfWeek   Int?
  slot        DaySlot     @default(FULL_DAY)

  // Ponctuel : plage de dates + slot
  startDate   DateTime?
  endDate     DateTime?

  // Expiration obligatoire
  expiresAt   DateTime
  createdAt   DateTime    @default(now())

  @@index([userId, expiresAt])
}

model SessionPoll {
  id          String      @id @default(uuid())
  partieId    String
  partie      Partie      @relation(fields: [partieId], references: [id], onDelete: Cascade)
  createdById String
  scenarioRef String?     // libellé optionnel (texte libre au P2)
  status      PollStatus  @default(OPEN)
  expiresAt   DateTime?
  chosenDate  DateTime?
  chosenSlot  DaySlot?
  createdAt   DateTime    @default(now())

  options     PollOption[]
  votes       PollVote[]

  @@index([partieId, status])  // enforcer "un seul OPEN par partie" côté service
}

model PollOption {
  id      String      @id @default(uuid())
  pollId  String
  poll    SessionPoll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  date    DateTime
  slot    DaySlot
  votes   PollVote[]
}

model PollVote {
  id       String      @id @default(uuid())
  pollId   String
  poll     SessionPoll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  optionId String
  option   PollOption  @relation(fields: [optionId], references: [id], onDelete: Cascade)
  userId   String
  user     User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  answer   VoteAnswer

  @@unique([optionId, userId])
}
```

**Algorithme `computeSlotStatus(userId, date, slot)`** :
1. Charger les déclarations actives de l'utilisateur (`expiresAt > now()`).
2. Vérifier si `date+slot` est couvert par une déclaration `UNAVAILABLE` → retourner `UNAVAILABLE`.
3. Vérifier si `date+slot` est couvert par une déclaration `AVAILABLE` → retourner `AVAILABLE`.
4. Calculer la période couverte = union de `[today, expiresAt]` pour les `RECURRING` + `[startDate, endDate]` pour les `PUNCTUAL`.
5. Si `date` est dans la période couverte → `AVAILABLE` (inférence positive).
6. Sinon → `UNKNOWN`.

---

## Métriques de succès

- **Adoption** : ≥ 80 % des membres ont au moins une déclaration active après 2 semaines d'utilisation.
- **Efficacité** : le MJ trouve une date sans outil externe de sondage (WhatsApp, Discord, Doodle, etc.) dans ≥ 75 % des cas.
- **Usage vote** : le vote est utilisé dans < 50 % des cas (indicateur que le calcul automatique suffit souvent).

**Contre-métrique :** surveiller les requêtes `available-slots` retournant 0 résultats — signal que les déclarations sont trop restrictives ou la fenêtre trop courte.
