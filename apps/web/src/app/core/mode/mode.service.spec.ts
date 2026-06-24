import { TestBed } from '@angular/core/testing';
import { ModeService } from './mode.service';
import { PartiesService } from '../parties/parties.service';

describe('ModeService', () => {
  let service: ModeService;
  let listResult: unknown[];

  beforeEach(() => {
    localStorage.clear();
    listResult = [];
    const partiesMock = { list: () => Promise.resolve(listResult) };
    TestBed.configureTestingModule({
      providers: [{ provide: PartiesService, useValue: partiesMock }],
    });
    service = TestBed.inject(ModeService);
  });

  it('hasMjParties devient true après refresh avec des parties', async () => {
    listResult = [{ id: 'p1' }];
    await service.refreshMjParties();
    expect(service.hasMjParties()).toBe(true);
  });

  it('repasse en mode joueur si on ne maîtrise plus aucune partie', async () => {
    service.setMode('mj');
    listResult = [];
    await service.refreshMjParties();
    expect(service.mode()).toBe('joueur');
    expect(service.hasMjParties()).toBe(false);
  });
});
