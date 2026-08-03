// Dérivé de l'hôte courant plutôt que figé sur `localhost`, afin de pouvoir ouvrir l'app depuis un
// AUTRE appareil du réseau local — typiquement un vrai téléphone, pour valider le rendu mobile du
// Palier 9 (le simulateur DevTools ne remplace pas un vrai écran tactile). En accès `localhost` le
// résultat est stric­tement identique à la valeur codée en dur précédente.
//
// ⚠️ CHANGEMENT DE DEV À REVOIR AVANT LA MISE EN PRODUCTION (Palier 10) : en prod l'API sera très
// probablement servie derrière le même domaine (reverse-proxy, chemin /api) et/ou en HTTPS sur le
// port 443 — ce calcul `hostname:3000` n'aura alors plus de sens. Voir docs/backlog.md § Palier 10.
const API_PORT = 3000;

export const API_BASE = `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
