import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

// PrismaService est global (PrismaModule @Global) → injectable sans réimport.
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
