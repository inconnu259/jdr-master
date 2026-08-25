/** Fait défiler jusqu'à l'AnnonceCard correspondant à `announcementId` (id DOM posé par
 *  AnnonceCard elle-même, `announcement-<id>`) et la met en évidence brièvement. Utilisé par
 *  PartieDetail/ScenarioEditor au clic sur le bandeau de notification du Shell (Story 29.13,
 *  révision) — l'élément peut ne pas encore exister au moment de l'appel (contenu d'onglet
 *  Angular Material monté après un cycle de rendu), d'où la tentative répétée sur quelques frames
 *  avant abandon silencieux (l'annonce reste alors simplement non mise en évidence, pas d'erreur). */
export function scrollToAnnouncement(announcementId: string, attemptsLeft = 15): void {
  const el = document.getElementById(`announcement-${announcementId}`);
  if (!el) {
    if (attemptsLeft > 0) {
      requestAnimationFrame(() => scrollToAnnouncement(announcementId, attemptsLeft - 1));
    }
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('annonce-card--highlight');
  setTimeout(() => el.classList.remove('annonce-card--highlight'), 2000);
}
