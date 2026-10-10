import type { PartieRole, PermissionAction } from '@master-jdr/shared';
import type { PartieGrant, ResolvedTarget } from '../../permissions/permission.service';

/**
 * Autorisation fabriquée pour les specs (Story 37.6). En production, seul
 * `PermissionService.assert()` délivre un `PartieGrant` ; un test qui simule ce service (ou qui
 * appelle directement `EventsService`) en a besoin d'un sans passer par la base.
 *
 * `partie` reprend la forme partielle que les specs utilisaient pour simuler l'ancien contrôle de
 * propriété ou de visibilité de la partie — seuls les champs lus par le code testé y figurent.
 * `target` vaut par défaut la partie seule : `EventsService` vérifie alors en base qu'une séance
 * ou un événement écrit lui appartient (`seance.count`/`event.count` à simuler).
 *
 * Réservé aux specs (exclu de `tsconfig.build.json`, jamais importé par du code de production).
 */
export function testGrant(
  partie: Record<string, unknown>,
  role: PartieRole = 'mj',
  target: Omit<ResolvedTarget, 'partieId'> = {},
  action: PermissionAction = 'PARTIE_READ',
): PartieGrant {
  return {
    partieId: partie.id,
    role,
    action,
    target: { partieId: partie.id, ...target },
    partie,
  } as unknown as PartieGrant;
}
