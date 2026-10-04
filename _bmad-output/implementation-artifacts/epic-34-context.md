# Epic 34 Context: Entrée dans l'application

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

La porte d'entrée de l'application cesse de mentir : plus de lien menant à une impasse, un message d'échec de connexion qui dit la vraie cause, des champs de mot de passe révélables, et des écrans d'authentification (connexion, inscription, mot de passe oublié, réinitialisation) plus le parcours « rejoindre par lien » mis en forme pour le mobile. C'est la première impression et la porte d'entrée des futurs joueurs. Épic front pur, isolé, sans dépendance sortante.

## Stories

- Story 34.1: Messages d'erreur véridiques à la connexion
- Story 34.2: Champ de mot de passe révélable, lien mort retiré
- Story 34.3: Mise en forme des écrans d'authentification

## Requirements & Constraints

- L'inscription reste ouverte uniquement sur invitation : sans jeton, elle ne peut pas aboutir. La règle métier n'est pas remise en cause, seul le lien d'entrée « Créer un compte » disparaît de la page de connexion. Le parcours d'inscription par lien d'invitation valide doit rester entièrement fonctionnel.
- Un message d'erreur ne ment jamais sur la cause : une API injoignable ne se dit pas « identifiants invalides ». Trois cas distincts : identifiants invalides, service indisponible, erreur inattendue (message honnête, sans détail technique exposé).
- Garde-fou d'énumération : la connexion accepte e-mail ou pseudo, donc ne jamais distinguer « compte inexistant » de « mot de passe incorrect » ; un seul message pour les identifiants invalides.
- La révélation du mot de passe s'applique à tout champ de mot de passe de l'application, pas seulement à la connexion, avec possibilité de re-masquer.
- Parité desktop/mobile : aucune surface cassée, aucun contenu tronqué ni débordant sur téléphone ; l'action principale est distinguée des actions secondaires.
- Jamais la couleur seule pour porter une information ; `prefers-reduced-motion` coupe toute animation ; la navigation clavier, l'ordre de focus et les `aria-label` de la base du design system restent en vigueur.

## Technical Decisions

- Aucune décision d'architecture dédiée et aucune dérogation serveur : le travail reste dans `features/auth/` côté front, sans changement d'API.
- Thème avant connexion : le thème du compte n'est connu qu'après identification ; `localStorage` sert de cache d'amorçage pour afficher le dernier thème connu sans clignotement. `ThemeToneService` reste seul propriétaire de l'application du thème (classe sur `body`, signal, cache local) ; ne pas dupliquer cette logique dans les écrans d'authentification.
- Les thèmes sont découpés par fichier et `medieval-steampunk` devient `atelier-cuivre` (épic 35, en dernier) : ne pas coder en dur de clé de thème dans les écrans d'authentification.
- SVG inline autorisé pour les icônes (ex. bascule œil / œil barré du champ de mot de passe).

## UX & Interaction Patterns

- Les écrans visés : connexion, inscription, mot de passe oublié, réinitialisation, et le parcours « rejoindre par lien ».
- Hiérarchie visuelle lisible sur téléphone ; séparation nette de l'action principale et des actions secondaires (liens, retours).
- Le registre des messages reste thématique et honnête : libellés d'état en mots, pas en codes.
- Affichage dans le dernier thème connu localement, sans flash d'un autre thème au chargement.

## Cross-Story Dependencies

- Ordonnable librement après l'épic 28 (compte et identité, qui porte le thème persisté sur le compte et son repli local) ; aucune dépendance sortante.
- 34.3 s'appuie sur le repli local du thème livré par l'épic 28 (story 28.4) pour le rendu sans clignotement.
- 34.2 retire le lien mort et ajoute la révélation du mot de passe ; 34.3 doit composer avec ces changements lors de la mise en forme des mêmes écrans (ordre conseillé : 34.1 → 34.2 → 34.3).
- Les textes de ces écrans seront relus par l'épic 35 (revue éditoriale des trois thèmes), une fois tous les écrans refondus.
