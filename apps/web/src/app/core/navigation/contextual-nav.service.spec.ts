import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { ContextualNavService } from './contextual-nav.service';

@Component({ selector: 'app-test-blank', template: '' })
class BlankComponent {}

async function createService() {
  await TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', component: BlankComponent }])],
  }).compileComponents();
  return TestBed.inject(ContextualNavService);
}

describe('ContextualNavService (Story 29.4)', () => {
  it('set() renseigne title et subtitle', async () => {
    const service = await createService();

    service.set({ title: 'Les Cendres de Kavaan', subtitle: 'Maître' });

    expect(service.title()).toBe('Les Cendres de Kavaan');
    expect(service.subtitle()).toBe('Maître');
  });

  it('set() sans subtitle → subtitle reste null', async () => {
    const service = await createService();

    service.set({ title: 'Mes aventures' });

    expect(service.title()).toBe('Mes aventures');
    expect(service.subtitle()).toBeNull();
  });

  it('clear() remet title et subtitle à null', async () => {
    const service = await createService();
    service.set({ title: 'Les Cendres de Kavaan', subtitle: 'Maître' });

    service.clear();

    expect(service.title()).toBeNull();
    expect(service.subtitle()).toBeNull();
  });

  it('une navigation (NavigationStart) déclenche clear() automatiquement', async () => {
    const service = await createService();
    service.set({ title: 'Les Cendres de Kavaan', subtitle: 'Maître' });
    expect(service.title()).toBe('Les Cendres de Kavaan');

    const router = TestBed.inject(Router);
    await router.navigate(['/somewhere']);

    expect(service.title()).toBeNull();
    expect(service.subtitle()).toBeNull();
  });
});
