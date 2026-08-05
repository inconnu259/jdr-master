import { TestBed } from '@angular/core/testing';
import { IdentityLabel } from './identity-label';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

function makeThemeService() {
  return {
    tone: () => ({
      'identity.character_label': 'Personnage',
      'identity.player_label': 'Joueur',
    }),
  };
}

async function createComponent(inputs: { characterName?: string | null; playerName?: string | null }) {
  await TestBed.configureTestingModule({
    imports: [IdentityLabel],
    providers: [{ provide: ThemeToneService, useValue: makeThemeService() }],
  }).compileComponents();
  const fixture = TestBed.createComponent(IdentityLabel);
  if (inputs.characterName !== undefined) {
    fixture.componentRef.setInput('characterName', inputs.characterName);
  }
  if (inputs.playerName !== undefined) {
    fixture.componentRef.setInput('playerName', inputs.playerName);
  }
  fixture.detectChanges();
  return fixture;
}

describe('IdentityLabel', () => {
  it('mode joint (les deux noms fournis) : personnage en italique, joueur en romain, aucune icône', async () => {
    const fixture = await createComponent({
      characterName: 'Ombreflèche',
      playerName: 'Incon',
    });
    const el = fixture.nativeElement;
    const characterEl = el.querySelector('.identity-label__character');
    const playerEl = el.querySelector('.identity-label__player');
    expect(characterEl.textContent.trim()).toBe('Ombreflèche');
    expect(playerEl.textContent.trim()).toBe('Incon');
    expect(el.querySelector('svg')).toBeNull();
  });

  it('mode single-character (personnage seul) : icône écu + aria-label', async () => {
    const fixture = await createComponent({ characterName: 'Ombreflèche' });
    const el = fixture.nativeElement;
    expect(el.querySelector('.identity-label__name').textContent.trim()).toBe('Ombreflèche');
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const wrapper = el.querySelector('.identity-label--single');
    expect(wrapper.getAttribute('aria-label')).toBe('Personnage Ombreflèche');
  });

  it('mode single-player (joueur seul) : icône silhouette + aria-label', async () => {
    const fixture = await createComponent({ playerName: 'Incon' });
    const el = fixture.nativeElement;
    expect(el.querySelector('.identity-label__name').textContent.trim()).toBe('Incon');
    const wrapper = el.querySelector('.identity-label--single');
    expect(wrapper.getAttribute('aria-label')).toBe('Joueur Incon');
    expect(el.querySelector('svg')).not.toBeNull();
  });
});
