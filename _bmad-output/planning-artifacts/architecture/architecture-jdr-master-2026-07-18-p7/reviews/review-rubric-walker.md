# Revue — ARCHITECTURE-SPINE Palier 7 (SSE)

**Verdict : à réviser (needs revision).** Le cœur du mécanisme (AD-1, AD-5 à AD-9) est solide et cohérent avec le brownfield vérifié (`getViewable`/`getOwned` confirmés dans `parties.service.ts`, session cookie confirmée dans `main.ts`, `ScenariosService._changed` confirmé conforme à la description). Mais AD-4 généralise un pattern qui, à la vérification, n'existe pas pour la moitié des services qu'elle cite — un vrai risque de divergence silencieuse — et un point d'authentification SSE n'est traité nulle part.

## Findings

1. **AD-4 fausse sa propre prémisse brownfield (bloquant).** La Rule suppose que chaque service de domaine a déjà un `_changed` privé à étendre d'un `notifyChanged()` public. Vérifié : `apps/web/src/app/core/characters/character.service.ts` et `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` n'ont **aucun** signal aujourd'hui (grep `signal(`/`changed` : zéro résultat) — ce sont de purs wrappers HTTP, cohérent avec FR-9/FR-10 du PRD qui décrivent justement ce vide. Ajouter `notifyChanged()` y signifie créer toute l'infrastructure réactive, pas juste exposer un champ privé existant. La Rule telle qu'écrite ne s'applique donc pas uniformément aux ~7 services listés — deux implémenteurs peuvent diverger sur la forme exacte (certains avec vrai compteur `_changed`, d'autres improvisant autre chose).

2. **`OpenPollsService`/`ModeService` (FR-14) ont une forme différente, non couverte par AD-4.** Vérifiés : ils ont des signals (`openPolls`, `mjParties`, `playerParties`) mais aucun `_changed`, et leur réactivité vient d'un `effect()` sur `playerParties()`, pas d'un compteur incrémenté manuellement. `notifyChanged()` y demanderait un comportement bespoke (ex. relancer `refresh()`), pas `this._changed.update(v=>v+1)` — la règle AD-4 ne prévient donc pas la divergence qu'elle prétend prévenir pour ces deux services précis, alors que FR-14 les cite explicitement.

3. **Angle mort réel non traité : auth cookie sur `EventSource`.** Toute l'authentification du projet repose sur un cookie de session (`express-session`+passport, confirmé dans `main.ts`), et chaque appel HTTP existant passe explicitement `withCredentials: true` (confirmé dans 17 fichiers de services frontend). `EventSource` natif n'envoie **pas** les cookies cross-origin sauf `new EventSource(url, { withCredentials: true })`. Ni AD-5, ni AD-9, ni la section Stack ne mentionnent cette option — alors qu'AD-5 dépend justement de `req.user` issu de cette même session pour `getViewable`. C'est exactement le type de divergence silencieuse (deux composants câblant `EventSource` différemment, l'un marchant, l'autre échouant en silence) que la spine doit prévenir et ne prévient pas ici.

4. **Détail mineur : `ScenarioDraftsService` cité dans AD-4 n'existe pas.** Vérifié : pas de service dédié, `scenario-drafts.ts` est un composant qui consomme `ScenariosService` directement — cohérent avec le Structural Seed (qui ne le liste pas), mais AD-4 le nomme comme s'il existait. Signal que l'audit brownfield de AD-4 n'a pas été vérifié fichier par fichier.

5. **Mineur, non bloquant : « rxjs dépendance transitive » est imprécis** — `rxjs` est une dépendance directe de `apps/api/package.json` (`^7.8.1`), pas seulement transitive. Sans conséquence sur la décision (aucun ajout de dépendance requis dans les deux cas).

## Points positifs vérifiés
- Couverture FR-1 à FR-15 complète dans la Capability Map.
- `PartiesService.getOwned`/`getViewable` bien réels, signature conforme à AD-5/AD-7.
- `apps/api/src/main.ts` confirme session cookie + CORS `credentials: true` tels que décrits.
- `ScenariosService` (frontend) conforme point par point à AD-1/AD-3/AD-4 (pattern `_changed`/`changed` déjà en place).
- Open Questions du PRD (canal FR-11, volume) correctement résolues (AD-7) ou différées avec justification (Non-Goals hobby-scale).

Fichier revu : `E:\dev\jdr-master\_bmad-output\planning-artifacts\architecture\architecture-jdr-master-2026-07-18-p7\ARCHITECTURE-SPINE.md`
