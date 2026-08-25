# Addendum — PRD Palier 3 (Évolution du personnage)

Détail mécanique des types de capacité référencés en §4.2 du PRD. Contenu spécifique aux règles Ryuutama (même statut que les classes/types/armes du Palier 2 — donnée de jeu, pas logique produit) — à faire migrer vers le mécanisme de seed data-driven (JSON gitignoré, comme `apps/api/game-systems/ryuutama/data/*.json`) au moment de l'implémentation, pas à coder en dur.

## Attribut

Le joueur choisit un attribut parmi Agilité, Esprit, Intelligence ou Vigueur, et l'augmente de 2 points. Maximum autorisé par attribut : 12.

## Classe

Le joueur obtient une classe supplémentaire avec les talents associés. S'il choisit une classe qu'il possède déjà, il devient meilleur dans les talents existants : les talents ne nécessitant pas de test voient leur résultat se cumuler ; les autres bénéficient d'un bonus de +1 aux tests appropriés. Si un personnage obtient, via cette capacité, un talent auquel il avait déjà accès grâce à un métier d'appoint (avec la pénalité de -1 habituelle des métiers d'appoint), cette pénalité disparaît et devient un bonus de +1.

## Immunité

Le personnage choisit un état parmi Blessé, Choc, Empoisonné, Las, Malade, Surexcité. Il n'est plus jamais affecté par cet état.

## Paysage ou climat favori

Le personnage choisit un paysage ou un climat parmi les 22 disponibles. Il bénéficie désormais d'un bonus de +2 aux tests appropriés à ce paysage/climat.

*[DÉCISION]* Cette capacité est débloquée deux fois dans la progression (niveaux 3 et 7). Confirmé par l'utilisateur : pas de cumul, le joueur choisit un paysage/climat différent à chaque obtention. C'est ce champ qui vient renseigner les cases "climat" du PDF Ryuutama restées inutilisées jusqu'ici.

## Protection d'un dragon

Un dragon des saisons prend le personnage en affection ; le joueur choisit une saison. Lorsqu'il voyage durant cette saison, le personnage est sous la protection de ce dragon : une fois par jour, le joueur peut décider que le résultat d'un test est 10, même après avoir lancé les dés, quel que soit le résultat obtenu.

## Type

Comme pour Classe, le personnage développe un nouveau type avec les capacités correspondantes. S'il choisit un type qu'il possède déjà, les bonus qu'il obtient sont doublés.

## Voyage légendaire

Le personnage atteint le stade ultime : l'homme-dragon lui révèle la nature des sept voyages légendaires, menant aux plus grands secrets, à des trésors inimaginables, voire au paradis — tous liés aux origines du monde. Contenu scénaristique spécifique, hors scope applicatif (cf. PRD §5 Non-Goals) : le système enregistre uniquement que la capacité est débloquée.
