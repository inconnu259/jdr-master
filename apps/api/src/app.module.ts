import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PartiesModule } from './parties/parties.module';
import { InvitationsModule } from './invitations/invitations.module';
import { AvailabilityModule } from './availability/availability.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]), // garde-fou global : 20 req/min
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PartiesModule,
    InvitationsModule,
    AvailabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
