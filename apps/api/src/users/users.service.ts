import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: { email: string; pseudo: string; password: string }) {
    const passwordHash = await argon2.hash(data.password);
    return this.prisma.user.create({
      data: { email: data.email, pseudo: data.pseudo, passwordHash },
    });
  }
}
