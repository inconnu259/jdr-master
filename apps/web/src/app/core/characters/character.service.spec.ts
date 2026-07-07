import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { GameSystemDto } from '@master-jdr/shared';
import { CharacterService } from './character.service';
import { API_BASE as API } from '../api-base';
import { makeCharacterDto } from './character-dto.fixture';

describe('CharacterService (front)', () => {
  let service: CharacterService;
  let http: HttpTestingController;

  const character = makeCharacterDto({ id: 'c1' });

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

  it('exportPdf(id, format) → GET /characters/:id/export.pdf?format=... en blob', async () => {
    const p = service.exportPdf('c1', 'editable');
    const req = http.expectOne(
      (r) => r.url === `${API}/characters/c1/export.pdf` && r.params.get('format') === 'editable',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.withCredentials).toBe(true);
    const blob = new Blob(['%PDF-1.6'], { type: 'application/pdf' });
    req.flush(blob);
    expect(await p).toEqual(blob);
  });

  it('exportPdf(id, "2pages") → passe le format en query param', async () => {
    const p = service.exportPdf('c1', '2pages');
    const req = http.expectOne(
      (r) => r.url === `${API}/characters/c1/export.pdf` && r.params.get('format') === '2pages',
    );
    req.flush(new Blob());
    await p;
  });

  it('updatePortrait(id, file, cropData) → PUT /characters/:id/portrait en FormData avec file + cropData JSON', async () => {
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const p = service.updatePortrait('c1', file, { scale: 1.2, offsetX: 1, offsetY: -1 });
    const req = http.expectOne(`${API}/characters/c1/portrait`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('cropData')).toBe(JSON.stringify({ scale: 1.2, offsetX: 1, offsetY: -1 }));
    req.flush({ ...character, portraitUrl: '/uploads/portraits/x.jpg' });
    expect((await p).portraitUrl).toBe('/uploads/portraits/x.jpg');
  });

  it('updatePortrait(id, file, null) → FormData sans champ cropData', async () => {
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const p = service.updatePortrait('c1', file, null);
    const req = http.expectOne(`${API}/characters/c1/portrait`);
    const body = req.request.body as FormData;
    expect(body.has('cropData')).toBe(false);
    req.flush(character);
    await p;
  });

  it('removePortrait(id) → DELETE /characters/:id/portrait', async () => {
    const p = service.removePortrait('c1');
    const req = http.expectOne(`${API}/characters/c1/portrait`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...character, portraitUrl: null });
    expect((await p).portraitUrl).toBeNull();
  });

  it('patchPdfPortraitCrop(id, cropData) → PATCH /characters/:id/pdf-portrait-crop en JSON, sans fichier', async () => {
    const cropData = { scale: 1.4, offsetX: 2, offsetY: -3 };
    const p = service.patchPdfPortraitCrop('c1', cropData);
    const req = http.expectOne(`${API}/characters/c1/pdf-portrait-crop`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual(cropData);
    req.flush({ ...character, pdfPortraitCropData: cropData });
    expect((await p).pdfPortraitCropData).toEqual(cropData);
  });
});
