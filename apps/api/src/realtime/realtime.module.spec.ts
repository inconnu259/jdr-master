import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RealtimeModule } from './realtime.module';
import { RealtimeEventsService } from './realtime-events.service';

// ConsumerModule n'importe PAS RealtimeModule — seul le module de test racine le fait.
// ConsumerService injecte RealtimeEventsService via son constructeur : sans @Global() sur
// RealtimeModule, Nest lèverait une erreur de résolution de dépendance à la compilation
// ("Nest can't resolve dependencies of ConsumerService"), car RealtimeEventsService ne serait
// visible que dans l'injecteur de RealtimeModule, pas dans celui de ConsumerModule (revue de
// code Story 18.1 : la version précédente de ce test réimportait RealtimeModule dans le même
// module racine que ConsumerModule, ce qui aurait fait passer le test même sans @Global()).
@Injectable()
class ConsumerService {
  constructor(public readonly events: RealtimeEventsService) {}
}

@Module({
  providers: [ConsumerService],
  exports: [ConsumerService],
})
class ConsumerModule {}

describe('RealtimeModule', () => {
  it('exporte RealtimeEventsService, injectable dans un module qui ne le réimporte pas (AC3, @Global())', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RealtimeModule, ConsumerModule],
    }).compile();

    const consumer = moduleRef.get(ConsumerService);

    expect(consumer.events).toBeInstanceOf(RealtimeEventsService);
  });
});
