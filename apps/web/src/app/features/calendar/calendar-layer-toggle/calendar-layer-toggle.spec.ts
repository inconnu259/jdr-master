import { TestBed } from '@angular/core/testing';
import type { CalendarLayerKey } from '@master-jdr/shared';
import { CalendarLayerToggle } from './calendar-layer-toggle';

async function createToggle(
  keys: CalendarLayerKey[],
  active: CalendarLayerKey[],
  overridden = false,
) {
  await TestBed.configureTestingModule({ imports: [CalendarLayerToggle] }).compileComponents();
  const fixture = TestBed.createComponent(CalendarLayerToggle);
  fixture.componentRef.setInput('keys', keys);
  fixture.componentRef.setInput('active', active);
  fixture.componentRef.setInput('overridden', overridden);
  fixture.detectChanges();
  return fixture;
}

describe('CalendarLayerToggle', () => {
  afterEach(() => TestBed.resetTestingModule());

  const KEYS: CalendarLayerKey[] = ['mes-disponibilites', 'mes-indisponibilites'];

  it('affiche un bouton par couche fournie, libellé via theme.tone()', async () => {
    const fixture = await createToggle(KEYS, KEYS);
    const buttons = fixture.nativeElement.querySelectorAll('.layer-chip');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent.trim()).toBe('Mes disponibilités');
  });

  it('une couche active porte la classe --active et aria-pressed="true"', async () => {
    const fixture = await createToggle(KEYS, ['mes-disponibilites']);
    const buttons = fixture.nativeElement.querySelectorAll('.layer-chip');
    expect(buttons[0].classList.contains('layer-chip--active')).toBe(true);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].classList.contains('layer-chip--active')).toBe(false);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('clic sur une couche émet layerToggled avec sa clé', async () => {
    const fixture = await createToggle(KEYS, KEYS);
    const emitted: CalendarLayerKey[] = [];
    fixture.componentInstance.layerToggled.subscribe((k) => emitted.push(k));

    fixture.nativeElement.querySelectorAll('.layer-chip')[0].click();

    expect(emitted).toEqual(['mes-disponibilites']);
  });

  it('pastille de rétablissement absente par défaut (overridden=false)', async () => {
    const fixture = await createToggle(KEYS, KEYS, false);
    expect(fixture.nativeElement.querySelector('.layer-toggle__reset')).toBeNull();
  });

  it('pastille visible si overridden=true, clic émet resetRequested (AC4)', async () => {
    const fixture = await createToggle(KEYS, KEYS, true);
    const resetBtn = fixture.nativeElement.querySelector('.layer-toggle__reset');
    expect(resetBtn).toBeTruthy();

    let resetCalled = false;
    fixture.componentInstance.resetRequested.subscribe(() => (resetCalled = true));
    resetBtn.click();

    expect(resetCalled).toBe(true);
  });
});
