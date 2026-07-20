import { TestBed } from '@angular/core/testing';
import { API_BASE } from '../api-base';
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

  beforeEach(() => {
    originalEventSource = (globalThis as any).EventSource;
    FakeEventSource.instances = [];
    (globalThis as any).EventSource = FakeEventSource;
    TestBed.configureTestingModule({});
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

  it("déclenche le mécanisme de notification sur 'open' sans lever d'exception (AC4)", () => {
    service.connect(partieTopic('p1'));

    expect(() => FakeEventSource.instances[0].emit('open')).not.toThrow();
  });

  it("déclenche le mécanisme de notification sur 'message', même chemin que 'open' (AC4)", () => {
    service.connect(partieTopic('p1'));

    expect(() => FakeEventSource.instances[0].emit('message')).not.toThrow();
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
