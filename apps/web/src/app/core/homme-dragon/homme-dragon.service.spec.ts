import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import type { HommeDragonDto } from '@master-jdr/shared';
import { HommeDragonService } from './homme-dragon.service';
import { API_BASE } from '../api-base';

function makeDto(overrides: Partial<HommeDragonDto> = {}): HommeDragonDto {
  return {
    id: 'hd1',
    userId: 'mj1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: {
      race: 'DRAGON_ROUGE',
      artefact: { key: 'grand-arc' },
      nom: 'Ignis',
    },
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    voyageursProteges: [],
    historique: [],
    derived: { level: 1, PS: 3 },
    eveilPowers: [],
    pendingEveilLevels: [],
    ...overrides,
  };
}

describe('HommeDragonService', () => {
  let service: HommeDragonService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HommeDragonService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('findOne() appelle GET /parties/:id/homme-dragon avec withCredentials', async () => {
    const promise = service.findOne('p1');

    const req = http.expectOne(`${API_BASE}/parties/p1/homme-dragon`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);

    req.flush(makeDto());

    await expect(promise).resolves.toEqual(makeDto());
  });

  it('create() appelle POST /parties/:id/homme-dragon avec le DTO, withCredentials', async () => {
    const dto = { race: 'DRAGON_ROUGE' as const, artefact: { key: 'grand-arc' }, nom: 'Ignis' };
    const promise = service.create('p1', dto);

    const req = http.expectOne(`${API_BASE}/parties/p1/homme-dragon`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    expect(req.request.withCredentials).toBe(true);

    req.flush(makeDto());

    await expect(promise).resolves.toEqual(makeDto());
  });

  it('update() appelle PATCH /parties/:id/homme-dragon avec le DTO, withCredentials', async () => {
    const dto = { artefact: { key: 'grande-epee' } };
    const promise = service.update('p1', dto);

    const req = http.expectOne(`${API_BASE}/parties/p1/homme-dragon`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(dto);
    expect(req.request.withCredentials).toBe(true);

    req.flush(makeDto({ sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grande-epee' }, nom: 'Ignis' } }));

    await expect(promise).resolves.toBeDefined();
  });

  it('chooseEveilPower() appelle POST /parties/:id/homme-dragon/eveil-power avec le DTO, withCredentials', async () => {
    const dto = { level: 2, key: 'escorte-du-dragon' };
    const promise = service.chooseEveilPower('p1', dto);

    const req = http.expectOne(`${API_BASE}/parties/p1/homme-dragon/eveil-power`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    expect(req.request.withCredentials).toBe(true);

    req.flush(makeDto({ eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }] }));

    await expect(promise).resolves.toBeDefined();
  });
});
