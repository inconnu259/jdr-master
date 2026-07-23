import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { API_BASE } from '../api-base';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { CharacterService } from '../characters/character.service';
import { HommeDragonService } from '../homme-dragon/homme-dragon.service';
import { InvitationsService } from '../invitations/invitations.service';
import { RealtimeService, matchingHandlers, partieTopic, userTopic } from './realtime.service';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  closed = false;
  constructor(
    public readonly url: string,
    public readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: () => void): void {
    (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)!).push(cb);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string): void {
    (this.listeners.get(type) ?? []).forEach((cb) => cb());
  }
}

describe('partieTopic', () => {
  it("construit le topic au format 'partie:{id}'", () => {
    expect(partieTopic('p1')).toBe('partie:p1');
  });
});

describe('userTopic', () => {
  it("construit le topic au format 'user:{id}'", () => {
    expect(userTopic('u1')).toBe('user:u1');
  });
});

describe('matchingHandlers', () => {
  it('retourne les handlers dont le préfixe matche le topic', () => {
    const notifyChanged = () => {};
    const handlers = [{ prefix: 'partie:', notifyChanged }];

    expect(matchingHandlers(handlers, 'partie:p1')).toEqual(handlers);
  });

  it('ignore les handlers dont le préfixe ne matche pas', () => {
    const handlers = [{ prefix: 'partie:', notifyChanged: () => {} }];

    expect(matchingHandlers(handlers, 'user:u1')).toEqual([]);
  });
});

describe('RealtimeService', () => {
  let service: RealtimeService;
  let originalEventSource: unknown;
  let partiesSvc: { notifyChanged: ReturnType<typeof vi.fn>; changed: ReturnType<typeof signal<number>> };
  let scenariosSvc: { notifyRealtimeChanged: ReturnType<typeof vi.fn>; changed: ReturnType<typeof signal<{ partieId: string } | null>> };
  let charactersSvc: { notifyChanged: ReturnType<typeof vi.fn>; changed: ReturnType<typeof signal<number>> };
  let hommeDragonSvc: { notifyChanged: ReturnType<typeof vi.fn>; changed: ReturnType<typeof signal<number>> };
  let invitationsSvc: { notifyChanged: ReturnType<typeof vi.fn>; changed: ReturnType<typeof signal<number>> };

  beforeEach(() => {
    originalEventSource = (globalThis as any).EventSource;
    FakeEventSource.instances = [];
    (globalThis as any).EventSource = FakeEventSource;
    partiesSvc = { notifyChanged: vi.fn(), changed: signal(0) };
    // Story 19.1 (Task 2) : RealtimeService injecte désormais aussi ScenariosService (deuxième
    // entrée dans handlers, même préfixe 'partie:'). Mock direct, comme PartiesService.
    scenariosSvc = { notifyRealtimeChanged: vi.fn(), changed: signal(null) };
    // Story 20.1 (Task 2) : RealtimeService injecte désormais aussi CharacterService (troisième
    // entrée dans handlers, même préfixe 'partie:'). Mock direct, comme PartiesService.
    charactersSvc = { notifyChanged: vi.fn(), changed: signal(0) };
    // Story 20.2 (Task 2) : RealtimeService injecte désormais aussi HommeDragonService (quatrième
    // entrée dans handlers, même préfixe 'partie:'). Mock direct, comme PartiesService.
    hommeDragonSvc = { notifyChanged: vi.fn(), changed: signal(0) };
    // Story 21.1 (Task 3) : RealtimeService injecte désormais aussi InvitationsService (cinquième
    // entrée dans handlers, PREMIÈRE au préfixe 'user:'). Mock direct, comme PartiesService.
    invitationsSvc = { notifyChanged: vi.fn(), changed: signal(0) };
    // RealtimeService injecte désormais PartiesService (Story 18.3, Task 4) — PartiesService
    // injecte lui-même HttpClient, jamais fourni par ce module de test isolé. Mock direct : ce
    // test ne porte pas sur les appels HTTP de PartiesService.
    TestBed.configureTestingModule({
      providers: [
        { provide: PartiesService, useValue: partiesSvc },
        { provide: ScenariosService, useValue: scenariosSvc },
        { provide: CharacterService, useValue: charactersSvc },
        { provide: HommeDragonService, useValue: hommeDragonSvc },
        { provide: InvitationsService, useValue: invitationsSvc },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    (globalThis as any).EventSource = originalEventSource;
  });

  it('connect() construit un EventSource avec la bonne URL et withCredentials: true (AC2)', () => {
    service.connect(partieTopic('p1'));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(`${API_BASE}/parties/p1/events`);
    expect(FakeEventSource.instances[0].init).toEqual({ withCredentials: true });
  });

  it("n'enregistre aucun listener 'error' — reconnexion native silencieuse (AC3)", () => {
    service.connect(partieTopic('p1'));

    expect(FakeEventSource.instances[0].listeners.get('error')).toBeUndefined();
  });

  it("'open' déclenche notifyChanged() sur le handler mappé au préfixe du topic (AC4, Story 18.3)", () => {
    service.connect(partieTopic('p1'));

    FakeEventSource.instances[0].emit('open');

    expect(partiesSvc.notifyChanged).toHaveBeenCalledTimes(1);
  });

  it("'message' déclenche le même mécanisme de notification que 'open' (AC4)", () => {
    service.connect(partieTopic('p1'));

    FakeEventSource.instances[0].emit('message');

    expect(partiesSvc.notifyChanged).toHaveBeenCalledTimes(1);
  });

  it("'open' déclenche AUSSI notifyRealtimeChanged() sur ScenariosService — deux handlers au même préfixe (Story 19.1, AC1)", () => {
    service.connect(partieTopic('p1'));

    FakeEventSource.instances[0].emit('open');

    expect(partiesSvc.notifyChanged).toHaveBeenCalledTimes(1);
    expect(scenariosSvc.notifyRealtimeChanged).toHaveBeenCalledTimes(1);
  });

  it("'open' déclenche AUSSI notifyChanged() sur CharacterService — trois handlers au même préfixe (Story 20.1, AC1)", () => {
    service.connect(partieTopic('p1'));

    FakeEventSource.instances[0].emit('open');

    expect(partiesSvc.notifyChanged).toHaveBeenCalledTimes(1);
    expect(scenariosSvc.notifyRealtimeChanged).toHaveBeenCalledTimes(1);
    expect(charactersSvc.notifyChanged).toHaveBeenCalledTimes(1);
  });

  it("'open' déclenche AUSSI notifyChanged() sur HommeDragonService — quatre handlers au même préfixe (Story 20.2, AC1)", () => {
    service.connect(partieTopic('p1'));

    FakeEventSource.instances[0].emit('open');

    expect(partiesSvc.notifyChanged).toHaveBeenCalledTimes(1);
    expect(scenariosSvc.notifyRealtimeChanged).toHaveBeenCalledTimes(1);
    expect(charactersSvc.notifyChanged).toHaveBeenCalledTimes(1);
    expect(hommeDragonSvc.notifyChanged).toHaveBeenCalledTimes(1);
  });

  it("un topic 'user:' ne déclenche PAS notifyChanged() de PartiesService (préfixe non mappé)", () => {
    service.connect(userTopic('u1'));

    FakeEventSource.instances[0].emit('open');

    expect(partiesSvc.notifyChanged).not.toHaveBeenCalled();
  });

  it("'open' sur un topic 'user:' déclenche notifyChanged() sur InvitationsService (AC1, Story 21.1)", () => {
    service.connect(userTopic('u1'));

    FakeEventSource.instances[0].emit('open');

    expect(invitationsSvc.notifyChanged).toHaveBeenCalledTimes(1);
  });

  it("un topic 'partie:' ne déclenche PAS notifyChanged() sur InvitationsService (préfixe différent, Story 21.1)", () => {
    service.connect(partieTopic('p1'));

    FakeEventSource.instances[0].emit('open');

    expect(partiesSvc.notifyChanged).toHaveBeenCalledTimes(1);
    expect(invitationsSvc.notifyChanged).not.toHaveBeenCalled();
  });

  it('disconnect() ferme la connexion EventSource sous-jacente (AC5)', () => {
    service.connect(partieTopic('p1'));

    service.disconnect(partieTopic('p1'));

    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('disconnect() sur un topic jamais connecté → no-op silencieux', () => {
    expect(() => service.disconnect(partieTopic('inconnu'))).not.toThrow();
  });

  it('deux connect() sur le même topic ouvrent deux EventSource indépendants (AD-6, anti-dédup)', () => {
    service.connect(partieTopic('p1'));
    service.connect(partieTopic('p1'));

    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('deux disconnect() successifs sur le même topic ferment les deux connexions indépendamment (AD-6)', () => {
    service.connect(partieTopic('p1'));
    service.connect(partieTopic('p1'));

    service.disconnect(partieTopic('p1'));
    service.disconnect(partieTopic('p1'));

    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(FakeEventSource.instances[1].closed).toBe(true);
  });
});
