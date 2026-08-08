import { Test } from '@nestjs/testing';
import { CharacterRolesController } from './character-roles.controller';
import { CharacterRolesService } from './character-roles.service';

function makeCharacterRolesService() {
  return {
    assign: jest.fn(),
    unassign: jest.fn(),
    listForPartie: jest.fn(),
  };
}

describe('CharacterRolesController', () => {
  let controller: CharacterRolesController;
  let characterRoles: ReturnType<typeof makeCharacterRolesService>;

  beforeEach(async () => {
    characterRoles = makeCharacterRolesService();
    const module = await Test.createTestingModule({
      controllers: [CharacterRolesController],
      providers: [{ provide: CharacterRolesService, useValue: characterRoles }],
    }).compile();
    controller = module.get(CharacterRolesController);
  });

  it('assign() délègue à CharacterRolesService.assign() avec partieId/characterId/user.id/roleKey', async () => {
    characterRoles.assign.mockResolvedValue({
      id: 'role1',
      characterId: 'char1',
      partieId: 'p1',
      roleKey: 'cartographe',
      assignedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await controller.assign(
      'p1',
      'char1',
      { id: 'mj1' } as any,
      {
        roleKey: 'cartographe',
      },
    );

    expect(characterRoles.assign).toHaveBeenCalledWith(
      'p1',
      'mj1',
      'char1',
      'cartographe',
    );
    expect(result.roleKey).toBe('cartographe');
  });

  it('unassign() délègue à CharacterRolesService.unassign() avec partieId/characterId/user.id', async () => {
    await controller.unassign('p1', 'char1', { id: 'mj1' } as any);

    expect(characterRoles.unassign).toHaveBeenCalledWith('p1', 'mj1', 'char1');
  });

  it('listForPartie() délègue à CharacterRolesService.listForPartie() avec partieId/user.id', async () => {
    characterRoles.listForPartie.mockResolvedValue([]);

    const result = await controller.listForPartie('p1', {
      id: 'joueur1',
    } as any);

    expect(characterRoles.listForPartie).toHaveBeenCalledWith('p1', 'joueur1');
    expect(result).toEqual([]);
  });
});
