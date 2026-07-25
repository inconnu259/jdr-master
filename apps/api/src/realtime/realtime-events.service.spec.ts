import {
  RealtimeEventsService,
  partieTopic,
  userTopic,
} from './realtime-events.service';

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

describe('RealtimeEventsService', () => {
  let service: RealtimeEventsService;

  beforeEach(() => {
    service = new RealtimeEventsService();
  });

  it('emit(topic) notifie un abonné du même topic (AC1)', () => {
    const received: { topic: string }[] = [];
    service.subscribe('partie:p1').subscribe((e) => received.push(e));

    service.emit('partie:p1');

    expect(received).toEqual([{ topic: 'partie:p1' }]);
  });

  it("emit(topic) ne notifie PAS un abonné d'un autre topic (AC2)", () => {
    const spy = jest.fn();
    service.subscribe('partie:p2').subscribe(spy);

    service.emit('partie:p1');

    expect(spy).not.toHaveBeenCalled();
  });

  it('plusieurs topics distincts ne se contaminent jamais entre eux', () => {
    const receivedA: { topic: string }[] = [];
    const receivedB: { topic: string }[] = [];
    service.subscribe('partie:a').subscribe((e) => receivedA.push(e));
    service.subscribe('partie:b').subscribe((e) => receivedB.push(e));

    service.emit('partie:a');
    service.emit('partie:b');
    service.emit('partie:a');

    expect(receivedA).toEqual([{ topic: 'partie:a' }, { topic: 'partie:a' }]);
    expect(receivedB).toEqual([{ topic: 'partie:b' }]);
  });
});
