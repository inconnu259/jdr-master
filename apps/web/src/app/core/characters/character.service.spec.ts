import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { CharacterDto, GameSystemDto } from '@master-jdr/shared';
import { CharacterService } from './character.service';
import { API_BASE as API } from '../api-base';

describe('CharacterService (front)', () => {
  let service: CharacterService;
  let http: HttpTestingController;

  const character: CharacterDto = {
    id: 'c1',
    userId: 'u1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: {},
    derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 11 },
    portraitUrl: null,
    portraitCropData: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CharacterService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getGameSystems() → GET /game-systems avec withCredentials', async () => {
    const p = service.getGameSystems();
    const req = http.expectOne(`${API}/game-systems`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    const systems: GameSystemDto[] = [{ id: 'ryuutama', name: 'Ryuutama', version: '1.0.0' }];
    req.flush(systems);
    expect(await p).toEqual(systems);
  });

  it('getGameSystemSchema(id) → GET /game-systems/:id/schema', async () => {
    const p = service.getGameSystemSchema('ryuutama');
    const req = http.expectOne(`${API}/game-systems/ryuutama/schema`);
    expect(req.request.method).toBe('GET');
    req.flush({ sheetSchema: {}, creationSteps: [] });
    expect(await p).toEqual({ sheetSchema: {}, creationSteps: [] });
  });

  it('getGameSystemContent(id) → GET /game-systems/:id/content', async () => {
    const p = service.getGameSystemContent('ryuutama');
    const req = http.expectOne(`${API}/game-systems/ryuutama/content`);
    expect(req.request.method).toBe('GET');
    const content = { class: [{ key: 'chasseur', data: { label: 'Chasseur' } }] };
    req.flush(content);
    expect(await p).toEqual(content);
  });

  it('create(partieId, dto) → POST /parties/:id/characters avec le payload', async () => {
    const dto = { gameSystemId: 'ryuutama', sheetData: {} };
    const p = service.create('p1', dto);
    const req = http.expectOne(`${API}/parties/p1/characters`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(character);
    expect(await p).toEqual(character);
  });

  it('listByPartie(partieId) → GET /parties/:id/characters', async () => {
    const p = service.listByPartie('p1');
    const req = http.expectOne(`${API}/parties/p1/characters`);
    expect(req.request.method).toBe('GET');
    req.flush([character]);
    expect(await p).toEqual([character]);
  });

  it('get(id) → GET /characters/:id avec withCredentials', async () => {
    const p = service.get('c1');
    const req = http.expectOne(`${API}/characters/c1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(character);
    expect(await p).toEqual(character);
  });
});
