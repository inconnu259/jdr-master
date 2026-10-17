import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { testGrant } from '../common/test-utils/grant';
import { callArg } from '../common/test-utils/jest-typed';
import type { PermissionService } from '../permissions/permission.service';
import { RALLIEMENT_UNAVAILABLE_MESSAGE } from '../permissions/permission.service';
import type { PartieSignalsPort } from '../poll/ports/partie-signals.port';
import type { CreateEventDto } from './dto/create-event.dto';
import type { EventsService } from './events.service';
import { GroupEventsService, INVALID_DAY_MESSAGE, PAST_DAY_MESSAGE } from './group-events.service';

/** Clé `YYYY-MM-DD` (UTC) décalée de `days` jours par rapport à aujourd'hui. */
function isoDay(days: number): string {
  const now = new Date();
  const ms =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86_400_000;
  return new Date(ms).toISOString().substring(0, 10);
}

const GROUPE = { id: 'g1', kind: 'CAMPAGNE_EPISODIQUE', gameSystemId: 'ralliement' };
const CARD = {
  id: 'e1',
  title: 'Catane',
  hostId: 'u1',
  hostDisplayName: 'Léa',
  seance: null,
  participants: [],
};

describe('GroupEventsService (Story 40.1)', () => {
  let permissions: { assert: jest.Mock };
  let events: { createHosted: jest.Mock; updateHosted: jest.Mock; listCards: jest.Mock };
  let signals: { notifyChanged: jest.Mock };
  let service: GroupEventsService;
  const order: string[] = [];

  const dto = (over: Partial<CreateEventDto> = {}): CreateEventDto =>
    ({ title: '  Catane  ', date: isoDay(3), slot: 'EVENING', ...over }) as CreateEventDto;

  beforeEach(() => {
    order.length = 0;
    permissions = { assert: jest.fn().mockResolvedValue(testGrant(GROUPE, 'member')) };
    events = {
      createHosted: jest.fn(() => {
        order.push('create');
        return Promise.resolve({ event: { id: 'e1' }, extension: undefined });
      }),
      updateHosted: jest.fn(() => {
        order.push('update');
        return Promise.resolve();
      }),
      listCards: jest.fn().mockResolvedValue([CARD]),
    };
    signals = {
      notifyChanged: jest.fn(() => {
        order.push('signals');
        return Promise.resolve();
      }),
    };
    service = new GroupEventsService(
      permissions as unknown as PermissionService,
      events as unknown as EventsService,
      signals as unknown as PartieSignalsPort,
    );
  });

  describe('create()', () => {
    it('droit EVENT_CREATE sur la partie, hôte = l’appelant, séance datée nettoyée, puis signaux et carte', async () => {
      const card = await service.create(
        'g1',
        'u1',
        dto({ lieu: ' Lyon 3e ', heureRdv: '20:30', notePratique: '   ', capacity: 8 }),
      );

      expect(permissions.assert).toHaveBeenCalledWith('u1', 'EVENT_CREATE', { partieId: 'g1' });
      const [, hostId, input] = events.createHosted.mock.calls[0] as [unknown, string, unknown];
      expect(hostId).toBe('u1');
      const day = isoDay(3);
      expect(input).toEqual({
        title: 'Catane',
        seance: {
          date: new Date(`${day}T00:00:00.000Z`),
          slot: 'EVENING',
          lieu: 'Lyon 3e',
          heureRdv: '20:30',
          notePratique: null,
          capacity: 8,
        },
      });
      // Signaux de la liste d'accueil APRÈS l'écriture validée.
      expect(order).toEqual(['create', 'signals']);
      expect(signals.notifyChanged).toHaveBeenCalledWith('g1');
      expect(callArg<string[]>(events.listCards, 0, 1)).toEqual(['e1']);
      expect(card).toEqual(CARD);
    });

    it('capacité absente = « tous les membres » (null)', async () => {
      await service.create('g1', 'u1', dto());

      const [, , input] = events.createHosted.mock.calls[0] as [
        unknown,
        unknown,
        { seance: { capacity: number | null } },
      ];
      expect(input.seance.capacity).toBeNull();
    });

    it('aujourd’hui est accepté', async () => {
      await service.create('g1', 'u1', dto({ date: isoDay(0) }));
      expect(events.createHosted).toHaveBeenCalledTimes(1);
    });

    it('un jour passé est refusé (400), rien n’est écrit', async () => {
      const refusal = service.create('g1', 'u1', dto({ date: isoDay(-1) }));
      await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
      await expect(refusal).rejects.toThrow(PAST_DAY_MESSAGE);
      expect(events.createHosted).not.toHaveBeenCalled();
      expect(signals.notifyChanged).not.toHaveBeenCalled();
    });

    it('une date inexistante est refusée (400)', async () => {
      await expect(service.create('g1', 'u1', dto({ date: '2031-02-31' }))).rejects.toThrow(
        INVALID_DAY_MESSAGE,
      );
      expect(events.createHosted).not.toHaveBeenCalled();
    });

    it('rencontre isolée (ONE_SHOT) : 403 « indisponible », rien n’est écrit', async () => {
      permissions.assert.mockResolvedValue(testGrant({ ...GROUPE, kind: 'ONE_SHOT' }, 'admin'));

      const refusal = service.create('g1', 'u1', dto());
      await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
      await expect(refusal).rejects.toThrow(RALLIEMENT_UNAVAILABLE_MESSAGE);
      expect(events.createHosted).not.toHaveBeenCalled();
    });

    it('un refus de droit remonte tel quel, rien n’est écrit', async () => {
      permissions.assert.mockRejectedValue(new ForbiddenException('refus'));

      await expect(service.create('g1', 'u1', dto())).rejects.toThrow('refus');
      expect(events.createHosted).not.toHaveBeenCalled();
      expect(signals.notifyChanged).not.toHaveBeenCalled();
    });
  });

  describe('update() — Story 40.2', () => {
    it('droit EVENT_UPDATE sur l’événement (jamais sur la partie), séance nettoyée, puis signaux et carte', async () => {
      const card = await service.update(
        'g1',
        'e1',
        'u1',
        dto({ lieu: ' Lyon 3e ', heureRdv: '19:00', notePratique: '  ', capacity: null }),
      );

      expect(permissions.assert).toHaveBeenCalledWith('u1', 'EVENT_UPDATE', { eventId: 'e1' });
      const [, eventId, input] = events.updateHosted.mock.calls[0] as [unknown, string, unknown];
      expect(eventId).toBe('e1');
      expect(input).toEqual({
        title: 'Catane',
        seance: {
          date: new Date(`${isoDay(3)}T00:00:00.000Z`),
          slot: 'EVENING',
          lieu: 'Lyon 3e',
          heureRdv: '19:00',
          notePratique: null,
          capacity: null,
        },
      });
      expect(order).toEqual(['update', 'signals']);
      expect(signals.notifyChanged).toHaveBeenCalledWith('g1');
      expect(callArg<string[]>(events.listCards, 0, 1)).toEqual(['e1']);
      expect(card).toEqual(CARD);
    });

    it('événement d’une autre partie que celle de la route → 404, rien n’est écrit', async () => {
      permissions.assert.mockResolvedValue(testGrant({ ...GROUPE, id: 'g2' }, 'member'));

      await expect(service.update('g1', 'e1', 'u1', dto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(events.updateHosted).not.toHaveBeenCalled();
      expect(signals.notifyChanged).not.toHaveBeenCalled();
    });

    it('rencontre isolée (ONE_SHOT) → 403 « indisponible », rien n’est écrit', async () => {
      permissions.assert.mockResolvedValue(testGrant({ ...GROUPE, kind: 'ONE_SHOT' }, 'admin'));

      await expect(service.update('g1', 'e1', 'u1', dto())).rejects.toThrow(
        RALLIEMENT_UNAVAILABLE_MESSAGE,
      );
      expect(events.updateHosted).not.toHaveBeenCalled();
    });

    it('nouvelle date passée ou inexistante → 400, rien n’est écrit', async () => {
      await expect(service.update('g1', 'e1', 'u1', dto({ date: isoDay(-1) }))).rejects.toThrow(
        PAST_DAY_MESSAGE,
      );
      await expect(service.update('g1', 'e1', 'u1', dto({ date: '2031-02-31' }))).rejects.toThrow(
        INVALID_DAY_MESSAGE,
      );
      expect(events.updateHosted).not.toHaveBeenCalled();
    });

    it('un refus de droit (non-hôte) remonte tel quel, rien n’est écrit ni signalé', async () => {
      permissions.assert.mockRejectedValue(new ForbiddenException('pas l’hôte'));

      await expect(service.update('g1', 'e1', 'u2', dto())).rejects.toThrow('pas l’hôte');
      expect(events.updateHosted).not.toHaveBeenCalled();
      expect(signals.notifyChanged).not.toHaveBeenCalled();
    });

    it('un refus de l’écriture (passée, capacité) ne signale rien', async () => {
      events.updateHosted.mockRejectedValue(new BadRequestException('trop petit'));

      await expect(service.update('g1', 'e1', 'u1', dto())).rejects.toThrow('trop petit');
      expect(signals.notifyChanged).not.toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('droit EVENT_LIST, puis les cartes de la partie de l’autorisation', async () => {
      const cards = await service.list('g1', 'u2');

      expect(permissions.assert).toHaveBeenCalledWith('u2', 'EVENT_LIST', { partieId: 'g1' });
      expect(events.listCards).toHaveBeenCalledTimes(1);
      expect(cards).toEqual([CARD]);
    });
  });
});
