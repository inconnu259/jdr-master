import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PollService } from './poll.service';

describe('PollService', () => {
  let service: PollService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PollService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAvailableSlots sans weeks appelle /parties/:id/available-slots', async () => {
    const promise = service.getAvailableSlots('p1');
    const req = http.expectOne('http://localhost:3000/parties/p1/available-slots');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
    await promise;
  });

  it('getAvailableSlots avec weeks=4 appelle /parties/:id/available-slots?weeks=4', async () => {
    const promise = service.getAvailableSlots('p1', 4);
    const req = http.expectOne('http://localhost:3000/parties/p1/available-slots?weeks=4');
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await promise;
  });

  it('getAvailableSlots avec from/to appelle la bonne URL', async () => {
    const promise = service.getAvailableSlots('p1', undefined, '2026-08-01', '2026-08-31');
    const req = http.expectOne('http://localhost:3000/parties/p1/available-slots?from=2026-08-01&to=2026-08-31');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
    await promise;
  });
});
