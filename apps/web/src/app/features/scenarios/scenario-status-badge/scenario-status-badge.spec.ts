import { TestBed } from '@angular/core/testing';
import type { ScenarioStatus } from '@master-jdr/shared';
import { ScenarioStatusBadge } from './scenario-status-badge';

async function createComponent(status: ScenarioStatus) {
  await TestBed.configureTestingModule({ imports: [ScenarioStatusBadge] }).compileComponents();
  const fixture = TestBed.createComponent(ScenarioStatusBadge);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return fixture;
}

describe('ScenarioStatusBadge', () => {
  it('BROUILLON → libellé "Brouillon", classe status-brouillon', async () => {
    const fixture = await createComponent('BROUILLON');
    const el = fixture.nativeElement.querySelector('.scenario-status-badge');
    expect(el.textContent.trim()).toBe('Brouillon');
    expect(el.classList).toContain('status-brouillon');
  });

  it('A_VENIR → libellé "À venir", classe status-a-venir', async () => {
    const fixture = await createComponent('A_VENIR');
    const el = fixture.nativeElement.querySelector('.scenario-status-badge');
    expect(el.textContent.trim()).toBe('À venir');
    expect(el.classList).toContain('status-a-venir');
  });

  it('COURANT → libellé "En cours" (jamais "Courant"), classe status-courant', async () => {
    const fixture = await createComponent('COURANT');
    const el = fixture.nativeElement.querySelector('.scenario-status-badge');
    expect(el.textContent.trim()).toBe('En cours');
    expect(el.classList).toContain('status-courant');
  });

  it('PASSE → libellé "Passé", classe status-passe', async () => {
    const fixture = await createComponent('PASSE');
    const el = fixture.nativeElement.querySelector('.scenario-status-badge');
    expect(el.textContent.trim()).toBe('Passé');
    expect(el.classList).toContain('status-passe');
  });
});
