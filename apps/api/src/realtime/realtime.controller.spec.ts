import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { RealtimeController } from './realtime.controller';
import { PartiesService } from '../parties/parties.service';
import {
  RealtimeEventsService,
  partieTopic,
  userTopic,
} from './realtime-events.service';

function makeParties() {
  return { getViewable: jest.fn() };
}

describe('RealtimeController', () => {
  let controller: RealtimeController;
  let parties: ReturnType<typeof makeParties>;
  let realtimeEvents: RealtimeEventsService;

  beforeEach(async () => {
    parties = makeParties();
    realtimeEvents = new RealtimeEventsService();
    const module = await Test.createTestingModule({
      controllers: [RealtimeController],
      providers: [
        { provide: PartiesService, useValue: parties },
        { provide: RealtimeEventsService, useValue: realtimeEvents },
      ],
    }).compile();
    controller = module.get(RealtimeController);
  });

  it('membre/MJ de la Partie → getViewable appelé, un emit() sur le bon topic remonte un MessageEvent (AC1)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

    const stream = await controller.partieEvents('p1', { id: 'u1' } as any);
    const received = firstValueFrom(stream.pipe(take(1)));

    expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
    realtimeEvents.emit(partieTopic('p1'));

    await expect(received).resolves.toEqual({ data: {} });
  });

  it('non-membre → ForbiddenException propagée par getViewable, subscribe jamais atteint (AC1)', async () => {
    parties.getViewable.mockRejectedValue(new ForbiddenException());
    const subscribeSpy = jest.spyOn(realtimeEvents, 'subscribe');

    await expect(
      controller.partieEvents('p1', { id: 'stranger' } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it("emit() sur un autre topic ne fait remonter aucun MessageEvent sur l'Observable du client (AC1, filtrage traversé sans casse)", async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

    const stream = await controller.partieEvents('p1', { id: 'u1' } as any);
    const receivedFromOther: unknown[] = [];
    stream.subscribe((e) => receivedFromOther.push(e));

    realtimeEvents.emit(partieTopic('autre-id'));

    expect(receivedFromOther).toEqual([]);
  });

  it('un utilisateur authentifié reçoit les événements de son propre topic utilisateur (AC1, Story 21.1)', async () => {
    const stream = controller.userEvents({ id: 'u1' } as any);
    const received = firstValueFrom(stream.pipe(take(1)));

    realtimeEvents.emit(userTopic('u1'));

    await expect(received).resolves.toEqual({ data: {} });
  });

  it("emit() sur le topic d'un AUTRE utilisateur ne fait remonter aucun MessageEvent (AC1, Story 21.1)", () => {
    const stream = controller.userEvents({ id: 'u1' } as any);
    const received: unknown[] = [];
    stream.subscribe((e) => received.push(e));

    realtimeEvents.emit(userTopic('autre-utilisateur'));

    expect(received).toEqual([]);
  });
});
