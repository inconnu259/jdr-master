# Addendum — PRD P3 : Moteur plugin & Ryuutama

Contenu volumineux extrait pour ne pas alourdir le PRD principal. Détail mécanique complet des règles de création de personnage Ryuutama (niveau 1), servant de base au seed JSON du plugin `GameSystem` Ryuutama.

**Source** : `Guide du Voyageur_light.pdf` (46 pages, fourni par l'utilisateur, contenu sous droits — voir NFR de confidentialité du seed dans le PRD). Extraction complète effectuée le 2026-07-03.

**⚠️ Rappel de portée** : ce guide ne couvre QUE la création de personnage niveau 1 des voyageurs (joueurs). Il exclut explicitement : évolution/montée de niveau, personnage du MJ (homme-dragon), moteur de résolution générique (combat détaillé), 4 classes additionnelles (Dresseur/Ermite/Météomancien/Navigateur/Professeur, dans un livret séparé), et le supplément "gobelins-chatons". Ces éléments sont hors scope de ce palier.

---

## 1. Étapes de création de personnage, dans l'ordre

| # | Étape | Nature |
|---|---|---|
| 1 | Choisir sa **classe** (7 classes) — détermine 3 talents fixes | Choix joueur |
| 2 | Choisir son **type** (Attaque / Technique / Magie) — avantages passifs ; sous-choix si Magie | Choix joueur (+ sous-choix si Magie) |
| 3 | Déterminer les **4 attributs** (AGI, ESP, INT, VIG) via un des 3 patterns (Équilibré / Polyvalent / Spécialiste), répartition libre | Choix joueur (valeurs fixes, répartition libre) |
| 4 | Calcul **PV et PE** | Automatique |
| 5 | Choisir une **arme favorite** parmi 5 catégories | Choix joueur |
| 6 | Choisir un **objet fétiche** (flavor pur, aucun effet mécanique) | Choix joueur |
| 7 | **Équipement** — mode pique-nique retenu pour ce palier (liste fixe, pas d'achat) | Automatique (mode pique-nique) |
| 8 | Champs narratifs (sexe, âge, particularités, village natal, motivation, nom, personnalité) | Choix joueur, sans effet mécanique |
| (futur, hors création) | Rôle de groupe (cartographe/chef/chroniqueur/intendant) — décidé en session 1 | Différé |

## 2. Attributs de base

4 attributs : **AGI**, **ESP**, **INT**, **VIG**. Valeur = nombre pair entre 4 et 12 (4-8 pour débutant) → taille du dé pour les tests (ex : VIG 6 → d6). Pas de jet aléatoire : valeurs fixes au choix parmi 3 patterns, réparties librement entre les 4 attributs.

- **Polyvalent** (seul pattern documenté avec exemple explicite dans ce guide) : {8, 4, 6, 6} → à répartir librement entre VIG/AGI/INT/ESP.
- **Équilibré** et **Spécialiste** : patterns mentionnés mais valeurs exactes absentes de ce guide (renvoi implicite au livre de base). **[OPEN QUESTION]** à récupérer avant l'implémentation complète du seed — voir Open Questions du PRD.

Pas de race jouable pour les voyageurs (tous humains) — l'Homme-Dragon (MJ) est hors scope.

## 3. Classes — 7 classes, chacune avec 3 talents fixes

Chaque talent : Effet / Conditions d'utilisation / Attributs utilisés (test) / Difficulté.

1. **Artisan** — *Création* (VIG+AGI, difficulté selon prix : <101 Po→6, <1001→8, <10001→10, <100001→14, >100000→18 ; durée = encombrement objet en jours, coût = moitié du prix) ; *Réparation* (VIG+AGI, même table, durée = encombrement en heures, coût = 10% du prix) ; *Transformation* dépouille→objets (AGI+INT, difficulté = 2×niveau du monstre). Doit choisir un type d'objet de spécialité **à la création** (obligatoire, unique).
2. **Chasseur** — *Chasse* (AGI+INT vs Paysage, 1×/jour avant campement, nourrit N personnes = résultat du test, repas devient "bon repas" ; échec double-1 → Blessé(6)) ; *Transformation* (AGI+INT, difficulté = 2×niveau monstre) ; *Traque* (VIG+INT vs Paysage, découvre un monstre, +1 dégâts ensuite).
3. **Fermier** — *Dressage* (2 animaux de bât suppl. sans coût eau/vivres, pas de test) ; *Métier d'appoint* (peut emprunter un talent d'une autre classe avec malus -1) ; *Robuste* (+1 tests de condition, +3 limite d'encombrement, passif).
4. **Guérisseur** — *Elixir miracle* (INT+ESP, difficulté = difficulté de l'état, annule un état 1h, 1×/jour/cible) ; *Herboristerie* (VIG+INT vs Paysage, obtient herbes de soins, 1×/jour ; échec double-1 → Empoisonné(6)) ; *Soins* (coûte 1 herbe + 1 eau, cible récupère PV = résultat test INT+ESP, réussite automatique hors combat selon le texte — à confirmer en implémentation).
5. **Marchand** — *Commerce* (négocier ≥4 objets identiques, INT+ESP, difficulté selon résultat : 6-7→10%, 8-9→20%, 10-13→40%, 14-17→60%, 18+→80%) ; *Dressage* (identique Fermier) ; *Éloquence* (+1 passif tests de négociation).
6. **Ménestrel** — *Légendes* (INT+INT, difficulté au choix du MJ) ; *Mélodies* (1×/partie, coûte 1 PV, AGI+ESP vs Paysage, +1 ou +3 au test suivant de tous les compagnons) ; *Voyages* (+1 passif sur tous les tests de voyage).
7. **Noble** — *Érudition* (identique Légendes) ; *Escrime* (arme favorite supplémentaire, +1 au toucher si répétée, pas de test) ; *Étiquette* (AGI+INT, difficulté = opposition).

Recommandation du guide (complexité, pas contrainte légale) : **débutants** → Chasseur, Guérisseur, Marchand, Ménestrel. **Habitués** → Artisan, Fermier, Noble.

## 4. Types (traits transversaux)

1 type parmi 3, avantages passifs fixes :

- **Attaque** : Endurance (+4 PV), Puissance (+1 dégâts), Entraînement (+1 arme favorite supplémentaire).
- **Technique** : Précision (+2 tests de concentration), Vitesse (+1 initiative), Bagages (+3 limite d'encombrement).
- **Magie** : Volonté (+4 PE), Grimoire (accès magie rituelle), Lié aux saisons (accès magie des saisons). **Sous-choix de sorts et mécanique de lancer (pages 34-41 du guide) différés à un palier ultérieur — voir NON-GOAL du PRD.** Pour ce palier, le type Magie n'octroie que les 3 avantages passifs ci-dessus, sans sélection de sorts opérationnelle.

## 5. Compétences

Pas de système de compétences séparé — porté entièrement par les 3 talents fixes de la classe + les avantages fixes du type (+ choix de sorts pour Magie, différé).

## 6. Statistiques dérivées — formules exactes

| Stat dérivée | Formule |
|---|---|
| PV max | VIG × 2 |
| PE max | ESP × 2 |
| Condition (jauge journalière) | VIG + ESP |
| Initiative | AGI + INT |
| Déplacement (test voyage) | VIG + AGI vs [Paysage + Climat] |
| Orientation (test voyage) | INT + INT vs [Paysage + Climat] |
| Campement (test voyage) | AGI + INT vs [Paysage + Climat] |
| Limite d'encombrement | VIG + 3 |
| Toucher/Dégâts par arme | cf. table §7 |

## 7. Armes favorites — 5 catégories

| Catégorie | Toucher | Dégâts | Prix | Enc | Mains |
|---|---|---|---|---|---|
| Arc | AGI+INT-2 | AGI | 750 Po | 3 | 2 |
| Épée courte | AGI+INT+1 | INT-1 | 400 Po | 1 | 1 |
| Épée longue | VIG+AGI | VIG | 700 Po | 3 | 1 |
| Hache | VIG+VIG-1 | VIG | 500 Po | 3 | 2 |
| Lance | VIG+AGI | VIG+1 | 350 Po | 3 | 2 |
| Mains nues (par défaut, non choisissable à la création) | VIG+AGI | VIG-2 | — | — | — |

Malus -1 PV par attaque avec une arme non favorite.

## 8. Équipement — mode "pique-nique" (retenu pour ce palier)

Équipement fixe fourni, aucun budget ni catalogue à gérer :
- **Nécessaire de voyage** (par personnage) : grand sac à dos, sac de couchage, couverts, outre, 2 rations. (Prix normal 150 Po — non appliqué en mode pique-nique.)
- **Nécessaire d'intendance** (par groupe) : animal de bât, tonneau, caisse, nécessaire de cuisine, 3 torches, briquet, savon, nécessaire à lessive, tente. (Prix normal 800 Po — non appliqué.)

**Arme favorite** : offerte gratuitement dans l'équipement de départ, hors budget.

**Différé** (hors scope) : achat complet avec 1000 Po, catalogue d'objets (armes/armures/vêtements/objets divers/contenants/paquetages/animaux), spécificités multiplicatrices d'objets (Beau ×2, Solide ×3, Mithril ×10, etc.), système d'encombrement/résistance détaillé par objet.

## 9. Règles de validation strictes (niveau 1)

1. Exactement 1 classe parmi les 7.
2. Exactement 1 type parmi les 3.
3. Attributs : 4 valeurs paires entre 4 et 12, correspondant exactement à un des patterns prédéfinis (assignation libre aux 4 attributs).
4. Exactement 1 arme favorite parmi les 5 catégories (pas "mains nues" en choix initial).
5. Artisan : doit choisir un type d'objet de spécialité (obligatoire, unique).
6. Type Magie : pas de sous-validation opérationnelle ce palier (sorts différés) — le choix du type seul suffit à valider.
7. Équipement mode pique-nique : pas de contrainte de budget (liste fixe).

## 10. Contenu explicitement hors scope de ce guide (et donc de ce palier)

- Évolution/montée de niveau des voyageurs.
- Création du personnage du MJ (homme-dragon).
- Moteur de résolution générique (combat détaillé, résolution de tests génériques).
- 4 classes additionnelles (Dresseur, Ermite, Météomancien, Navigateur, Professeur) — livret séparé.
- Supplément "gobelins-chatons" — livret séparé.
- Chapitre Magie complet (sorts par saison/niveau, ciblage, portée, durée — pages 34-41).
- Herbes de soins en détail (cueillette, pages 32-33) et mécanique d'Améliorations liée à la magie avancée.
- Rôle de groupe (décidé en session, pas à la création).
- Achat d'équipement complet (1000 Po + catalogue).

---

*Fichier de travail intermédiaire (texte brut extrait du PDF) : `C:\Users\incon\AppData\Local\Temp\claude\E--dev-jdr-master\0d521fe3-28c3-49ad-bbe0-8758564591c9\scratchpad\extracted.txt` — temporaire, non versionné.*
