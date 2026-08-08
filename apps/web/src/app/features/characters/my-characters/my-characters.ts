import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import type { MyCharacterDto } from '@master-jdr/shared';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName } from '../../../core/characters/character.util';
import { CharacterSummaryCard } from '../character-summary-card/character-summary-card';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

@Component({
  selector: 'app-my-characters',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatIconModule, CharacterSummaryCard],
  templateUrl: './my-characters.html',
  styleUrl: './my-characters.scss',
})
export class MyCharacters implements OnInit {
  private readonly characters = inject(CharacterService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeToneService);

  protected readonly all = signal<MyCharacterDto[]>([]);
  protected readonly query = signal('');
  // AC4 : filtrage en direct sur le nom du personnage — même convention d'identité que l'épic 28
  // (characterName(), pas de réimplémentation locale du fallback « Personnage sans nom »).
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.all();
    if (!q) return list;
    return list.filter((c) => characterName(c).toLowerCase().includes(q));
  });

  async ngOnInit(): Promise<void> {
    try {
      this.all.set(await this.characters.listMine());
    } catch {
      this.all.set([]);
    }
  }

  open(c: MyCharacterDto): void {
    void this.router.navigate(['/parties', c.partieId, 'characters', c.id]);
  }
}
