# jdr-master

Petite application pour pouvoir gérer une campagne de jeu de rôle.

# TODO :
Mode administateur
  -
Création de personnage
  -
Gestion des personnages
  - voir son personnage
  - augmenter de niveau
  - ajouter des équipements
  - ajouter des notes
Création de campagne
  - pouvoir créer une nouvelle campagne et ajouter les joueurs
Gestion de la campagne
  - ajouter des evenements
  - ajouter un historique
  - ajouter les missions
  - ajouter une timeline
  - ajouter une carte


# configuration
docker compose build
docker compose up -d

# tooltips
logs:
- docker compose logs -f client
composer:
- docker exec -it api composer --version
