# Review — Vérification versions / réalité (Reviewer Gate)

**Lens :** chaque décision engagée doit être vérifiée par recherche web ou confrontation au réel (dépôt existant, starter), pas assertée depuis la mémoire d'entraînement.
**Cible :** `ARCHITECTURE-SPINE.md` — Palier 7, mécanisme SSE.
**Date de revue :** 2026-07-18.

## Verdict

**PASS avec réserves.** Les trois affirmations centrales (`@Sse()` natif sans package séparé, `EventSource` avec reconnexion ~3s, aucune dépendance npm nouvelle) sont **exactes et confirmées** par recherche web au moment de la revue. Mais la section Stack du spine est **plus mince que ce qu'elle prétend** : les sources citées ne couvrent pas la version réellement installée dans le repo, et un point de vigilance concret (comportement SSE face à interceptors/déconnexion, corrigé très récemment côté NestJS) n'a pas été croisé avec le lockfile du projet alors qu'il l'aurait dû.

## Constats détaillés

### 1. `@Sse()` — confirmé, mais preuve indirecte (DeepWiki, pas la doc officielle)
Le spine cite `deepwiki.com/nestjs/nest/9.6-server-sent-events` comme source. DeepWiki est un wiki généré automatiquement par un tiers, pas la documentation officielle (`docs.nestjs.com/techniques/server-sent-events`, qui existe et confirme la même chose). Recherche web confirmée : `@Sse()` reste un décorateur natif de `@nestjs/common`, retournant un `Observable<MessageEvent>`, sans package séparé, disponible sur Express et Fastify. **Le fait est correct**, mais la source privilégiée n'est pas la plus autorité — un lien vers `docs.nestjs.com` aurait dû accompagner ou remplacer DeepWiki. Mineur, à corriger facilement.

### 2. Version NestJS réellement installée non vérifiée contre le lockfile — lacune réelle
`apps/api/package.json` épingle `@nestjs/common`/`@nestjs/core` en `^11.0.1`. Le `pnpm-lock.yaml` résout actuellement sur **`11.1.27`**. Or la recherche web montre une activité récente et pertinente sur l'implémentation SSE de NestJS :
- **v11.1.28** (2026-07-08, soit **10 jours avant la date de ce spine**) corrige un bug de *teardown de l'Observable producteur SSE lors d'une déconnexion client avec interceptor* — directement pertinent pour AD-1/AD-8 (fermeture propre du flux à la déconnexion).
- Un autre correctif récent (#17098) concernait un cas de régression `@Sse()` sur route `@Post()` introduit en 11.1.25 — non applicable ici puisque AD-5 prévoit du `GET`, mais qui montre que le comportement SSE de NestJS **a bougé plusieurs fois dans les semaines précédant ce palier**.

Le spine ne mentionne à aucun moment la version résolue (`11.1.27`) ni ce correctif de 11.1.28. C'est exactement le genre de vérification « repo réel + web » que cette lens demande et qui manque : le point de vigilance cité (issue #12670, ouverte en 2023) est réel mais **daté et générique** — la vérification n'a pas cherché s'il existait des développements plus récents et plus spécifiquement applicables (il y en a). À minima, il faudrait consigner en Deferred : *« vérifier lors de l'implémentation si l'upgrade vers `11.1.28+` est nécessaire pour bénéficier du fix de teardown sur déconnexion »*.

### 3. `EventSource` et reconnexion ~3s — confirmé, source correcte (MDN)
Recherche web confirme : délai de reconnexion par défaut de 3000 ms, ajustable via la ligne `retry:` du flux SSE, exactement comme décrit en AD-8. La source citée (MDN) est appropriée et suffisante ici — pas de réserve.

### 4. « Aucune dépendance additionnelle » — confirmé mais reste à re-vérifier au lockfile après implémentation
L'affirmation que `rxjs` est déjà une dépendance (transitive de NestJS, mais aussi dépendance directe listée dans `apps/api/package.json` ligne 51 : `"rxjs": "^7.8.1"`) est vérifiable directement dans le repo — bien fait, cohérent avec les sources listées en frontmatter (`apps/api/package.json` cité comme source de lecture brownfield). C'est le seul des trois axes de vérification qui s'appuie explicitement sur une lecture du repo plutôt que sur une recherche web ou une assertion.

### 5. Absence de vérification sur Angular 22 / `EventSource` côté zoneless
Le spine ne discute pas d'un point spécifique à ce projet : Angular 22 fonctionne en mode zoneless (cf. mémoire du projet — tests déjà adaptés à ce comportement). Un `EventSource` `onmessage` déclenchant `notifyChanged()` sur un signal (AD-3/AD-4) doit s'exécuter correctement sans zone.js pour déclencher la détection de changement — ce n'est pas un problème pour les signals Angular (ils ne dépendent pas de zone.js), donc le risque est faible, mais le spine ne le mentionne pas explicitement comme point vérifié ni comme non-risque écarté consciemment. Mineur — à noter plutôt qu'à bloquer.

## Résumé actionnable

| # | Sévérité | Action recommandée |
| --- | --- | --- |
| 1 | Mineure | Remplacer/compléter la source DeepWiki par `docs.nestjs.com/techniques/server-sent-events` (doc officielle) dans la table Stack |
| 2 | **Moyenne** | Ajouter en Deferred ou en point de vigilance : version résolue actuelle `@nestjs/common@11.1.27` (lockfile), et le correctif 11.1.28 (2026-07-08) sur le teardown SSE à la déconnexion avec interceptor — à vérifier/upgrade si le comportement observé à l'implémentation le justifie |
| 3 | — | Aucune action — confirmé exact |
| 4 | — | Aucune action — bien vérifié contre le repo |
| 5 | Mineure | Noter explicitement (une ligne) que le fonctionnement zoneless d'Angular 22 n'affecte pas la propagation `EventSource` → signal, pour lever toute ambiguïté future |

**Conclusion :** les affirmations techniques sont factuellement correctes, mais la vérification a été plus superficielle qu'elle n'y paraît — un croisement avec le lockfile réel du projet (facilement disponible) aurait révélé un correctif récent et pertinent que le spine a manqué en s'appuyant sur une issue GitHub de 2023 comme unique point de vigilance.
