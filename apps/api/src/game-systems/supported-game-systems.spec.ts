import { gameSystemHasModule, GAME_SYSTEMS } from '@master-jdr/shared';
import { SUPPORTED_GAME_SYSTEMS } from './supported-game-systems';

/**
 * Revue de code (Story 29.15) : `GAME_SYSTEMS[].module` (`packages/shared`) et
 * `SUPPORTED_GAME_SYSTEMS` (ici) sont deux listes maintenues indépendamment, sans aucun test les
 * reliant — un futur système ajouté à l'une sans l'autre désynchroniserait silencieusement le
 * gating web/signal (`gameSystemHasModule`, consommé par `canCreateCharacter`/`party-signals.service.ts`)
 * de la vraie garde serveur (`SUPPORTED_GAME_SYSTEMS`). Ce test échoue dès que les deux listes divergent.
 */
describe('SUPPORTED_GAME_SYSTEMS ↔ GAME_SYSTEMS[].module (parité)', () => {
  it.each(SUPPORTED_GAME_SYSTEMS)(
    "système supporté « %s » → gameSystemHasModule() est true",
    (id) => {
      expect(gameSystemHasModule(id)).toBe(true);
    },
  );

  it.each(GAME_SYSTEMS.filter((g) => !SUPPORTED_GAME_SYSTEMS.includes(g.id)).map((g) => g.id))(
    "système non supporté par l'API « %s » → gameSystemHasModule() est false",
    (id) => {
      expect(gameSystemHasModule(id)).toBe(false);
    },
  );
});
