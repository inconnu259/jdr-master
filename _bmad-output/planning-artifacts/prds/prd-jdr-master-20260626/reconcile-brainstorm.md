# Réconciliation brainstorm-intent → PRD Palier 2 (Calendrier)

Date : 2026-06-26

## Ce qui est bien couvert

- **Décision architecturale "Calendrier par indispos"** (brainstorm §3) : intégralement traduite. Le principe "chacun déclare ses indisponibilités / le système calcule l'intersection / vote optionnel si ambiguïté" structure l'ensemble du PRD (F1, F2, F3). La distinction avec Doodle est explicitement rappelée dans le contexte.
- **Contrainte positive (disponibilité explicite)** : le brainstorm mentionne "contrainte positive" ; le PRD la couvre via le type `AVAILABLE` dans `AvailKind` et FR-1.1.
- **Récurrent + ponctuel** : les deux modes de déclaration du brainstorm sont présents (FR-1.1, modèle `RecurKind`).
- **Vue MJ "5 prochaines dates"** : le point ouvert Q1 du brainstorm ("peut-il voir les 5 prochaines dates directement sans vote ?") est tranché en FR-2.2, avec la réponse "Oui, calculé à la demande" — c'est cohérent avec la suggestion du brainstorm de le décider en P2.
- **Vote optionnel** : bien positionné comme optionnel (F3), en ligne avec "vote optionnel si ambiguïté" du brainstorm.
- **Notifications email = hors palier** : le brainstorm classe SMTP comme bloquant scope-2 (P6) ; le PRD le mentionne en FR-3.4 et dans "hors périmètre".

---

## Gaps trouvés (max 5)

### Gap 1 — "Contrainte positive" absente du libellé du point ouvert Q1

**Brainstorm §6, Q1 :** "Le MJ peut-il voir les 5 prochaines dates où tout le monde est dispo directement sans vote ?"
**PRD Q1 :** reformulé en "Le MJ peut-il voir les créneaux sans que tous les membres aient déclaré leurs indispos ?" — c'est une question différente (gestion des inconnus), pas la même que la question originale du brainstorm.
**Impact :** mineur. La réponse du brainstorm ("à trancher en P2") est bien appliquée, mais la Q1 du PRD répond à une sous-question secondaire, pas à la question principale. La question du brainstorm est implicitement résolue par FR-2.2, mais sans y être explicitement référencée.
**Suggestion :** ajouter une note en FR-2.2 : "Répond à la question ouverte du brainstorm : le MJ voit directement les créneaux sans lancer de vote."

---

### Gap 2 — Hiérarchie "scope" non rappelée dans le PRD

**Brainstorm §2 :** trois scopes (perso Docker local / cloud semi-public / plateforme publique). Le passage scope-1 → scope-2 est conditionné aux notifications SMTP.
**PRD :** le champ `scope: personal / scope-1` est en en-tête YAML, mais nulle part dans le corps le PRD n'explique ce que ce scope implique pour les décisions de design (ex : pas d'infra publique, pas de modération, groupe de confiance).
**Impact :** moyen. Un développeur lisant le PRD sans le brainstorm ne comprend pas pourquoi certains choix sont "COULD" vs "BLOQUANT scope-2".
**Suggestion :** ajouter un paragraphe court dans "Contexte & problème" rappelant les trois scopes et indiquant que ce palier vise exclusivement scope-1.

---

### Gap 3 — P2 MVP défini dans le brainstorm : vote inclus, mais son caractère "optionnel dans le calcul" mérite d'être clarifié

**Brainstorm §5 :** "P2 = Calendrier indispos + calcul automatique + vote" — les trois éléments sont au même niveau dans le palier.
**PRD §F3 :** le vote est bien inclus mais son introduction dit "Optionnel : quand les créneaux calculés ne suffisent pas". Il n'est pas clair si "optionnel" signifie que le MJ peut choisir de ne pas l'utiliser (correct) ou que l'implémentation est optionnelle pour P2 (ce qui contredirait le brainstorm).
**Impact :** faible, mais source d'ambiguïté pour l'équipe de dev.
**Suggestion :** clarifier en FR-3 : "Le vote est une fonctionnalité MUST de ce palier, mais son usage par le MJ est optionnel (il peut utiliser le calcul automatique sans lancer de vote)."

---

### Gap 4 — Points ouverts Q2, Q3, Q4 du brainstorm non réconciliés

**Brainstorm §6 :** liste 5 points ouverts dont Q2 ("Visibilité granulaire des infos session — SHOULD, design à affiner en P5"), Q3 ("Message secret MJ→joueur — COULD"), Q4 ("Hiérarchie modules plugins — avant P3/P7"), Q5 ("Propriétaire validation fiche MJ override — à formaliser en P3").
**PRD :** aucun de ces points n'est mentionné (ce qui est attendu pour un PRD focalisé sur P2), mais il n'y a aucune note indiquant qu'ils ont été volontairement mis hors scope de ce document.
**Impact :** faible pour P2, mais risque de perte de traçabilité si le brainstorm n'est pas relu avant P3/P5.
**Suggestion :** ajouter dans "Ce qui est hors périmètre" une ligne : "Points ouverts du brainstorm concernant P3+ (hiérarchie plugins, validation MJ-override, visibilité granulaire, messages secrets) — non traités ici, voir brainstorm-intent §6."

---

### Gap 5 — Critère de succès MVP (brainstorm §5) non reflété dans les métriques

**Brainstorm §5 :** "Critère de succès MVP : un groupe peut [...] trouver des dates sans sondage manuel [...]"
**PRD "Métriques de succès" :** formule ses propres métriques (80% adoption, 75% sans WhatsApp, <50% usage vote), ce qui est bien. Mais la métrique "sans sondage manuel" du brainstorm est traduite en "sans WhatsApp" — ce qui est plus restrictif (un groupe peut avoir migré vers Signal ou Discord).
**Impact :** très faible, mais le libellé peut créer une fausse impression de succès.
**Suggestion :** reformuler la métrique en "sans outil externe de sondage (WhatsApp, Discord, Doodle, etc.)" pour rester fidèle à l'intention du brainstorm.

---

## Conclusion

Le PRD est globalement fidèle aux décisions du brainstorm. Les trois piliers de P2 (indispos, calcul automatique, vote optionnel) sont couverts avec un niveau de détail bien supérieur au brainstorm, ce qui est attendu. Le point ouvert Q1 du brainstorm est résolu correctement dans FR-2.2. Les gaps identifiés sont tous de niveau mineur à moyen — aucun ne remet en cause le périmètre ou les choix architecturaux.

**Priorité des corrections suggérées :**
1. Gap 2 (contexte scope) : utile pour la lisibilité dès maintenant.
2. Gap 3 (ambiguïté "optionnel" vote) : à corriger avant de commencer le dev de F3.
3. Gap 4 (traçabilité points ouverts P3+) : une ligne suffit.
4. Gap 1 et Gap 5 : cosmétiques, à corriger si le PRD est partagé largement.
