import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';

// Module minimal, volontairement indépendant d'AppModule : bootstraper AppModule ici se heurte à
// un problème pré-existant et sans rapport avec cette story (packages/shared, "type": "module",
// résolu nativement en ESM par Node — Jest échoue avec "Unexpected token 'export'" dès que
// GameSystemModule/PartiesModule sont chargés, y compris hors de tout contexte e2e — reproduit à
// l'identique avec un simple import direct de create-partie.dto.ts sous la config Jest
// principale). Seul le comportement du middleware helmet() est sous test ici, pas AppModule.
@Controller()
class ProbeController {
  @Get()
  ping() {
    return 'pong';
  }
}

describe('En-têtes de sécurité (e2e, Story 16.1 AC2)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Même appel qu'en production (main.ts) — helmet() active noSniff() par défaut, qui pose
    // X-Content-Type-Options: nosniff sur toutes les réponses, sans restriction de route.
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    await app.init();
  });

  it('inclut X-Content-Type-Options: nosniff sur toute réponse (posé globalement par helmet())', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect('X-Content-Type-Options', 'nosniff');
  });

  afterEach(async () => {
    // Garde : si beforeEach a échoué avant d'assigner `app` (compile()/init() en erreur), ne pas
    // masquer l'erreur réelle derrière un TypeError sur `app.close()`.
    if (app) {
      await app.close();
    }
  });
});
