import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InvitationDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  /** Le MJ invite un utilisateur déjà inscrit. Idempotent : ré-invite ranime une invitation close. */
  async invite(partieId: string, inviterId: string, inviteeUserId: string) {
    await this.parties.getOwned(partieId, inviterId); // MJ uniquement
    if (inviteeUserId === inviterId) {
      throw new BadRequestException(
        'Vous ne pouvez pas vous inviter vous-même.',
      );
    }
    const invitee = await this.prisma.user.findUnique({
      where: { id: inviteeUserId },
    });
    if (!invitee) throw new NotFoundException('Utilisateur introuvable');

    const alreadyMember = await this.prisma.membership.findUnique({
      where: { userId_partieId: { userId: inviteeUserId, partieId } },
    });
    if (alreadyMember)
      throw new ConflictException(
        'Cet utilisateur est déjà membre de la partie.',
      );

    return this.prisma.invitation.upsert({
      where: { partieId_inviteeUserId: { partieId, inviteeUserId } },
      create: { partieId, inviterId, inviteeUserId },
      update: { status: 'PENDING', inviterId, respondedAt: null },
    });
  }

  /** Invitations émises pour une partie (vue MJ). */
  async listForPartie(partieId: string, mjId: string) {
    await this.parties.getOwned(partieId, mjId);
    return this.prisma.invitation.findMany({
      where: { partieId },
      orderBy: { createdAt: 'desc' },
      include: { invitee: { select: { id: true, pseudo: true, email: true } } },
    });
  }

  /** Invitations PENDING reçues par l'utilisateur courant (→ dashboard joueur). */
  async listReceived(userId: string): Promise<InvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { inviteeUserId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        partie: { select: { id: true, name: true, gameSystemId: true } },
        inviter: { select: { pseudo: true } },
      },
    });
    return invitations.map((inv) => ({
      id: inv.id,
      partie: inv.partie,
      inviterPseudo: inv.inviter.pseudo,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  /** Le destinataire accepte : crée le Membership et marque ACCEPTED (atomique). */
  async accept(invitationId: string, userId: string) {
    const inv = await this.requirePendingForInvitee(invitationId, userId);
    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: { userId_partieId: { userId, partieId: inv.partieId } },
        create: { userId, partieId: inv.partieId },
        update: {},
      }),
      this.prisma.invitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
    ]);
    return { ok: true, partieId: inv.partieId };
  }

  /** Le destinataire refuse. */
  async decline(invitationId: string, userId: string) {
    await this.requirePendingForInvitee(invitationId, userId);
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return { ok: true };
  }

  /** L'inviteur (ou le MJ de la partie) révoque une invitation. */
  async revoke(invitationId: string, userId: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { partie: { select: { mjId: true } } },
    });
    if (!inv) throw new NotFoundException('Invitation introuvable');
    if (inv.inviterId !== userId && inv.partie.mjId !== userId)
      throw new ForbiddenException();
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED', respondedAt: new Date() },
    });
    return { ok: true };
  }

  /** Garde-fou commun à accept/decline : invitation existante, PENDING, adressée à l'utilisateur. */
  private async requirePendingForInvitee(invitationId: string, userId: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!inv || inv.inviteeUserId !== userId)
      throw new NotFoundException('Invitation introuvable');
    if (inv.status !== 'PENDING')
      throw new ConflictException('Invitation déjà traitée.');
    return inv;
  }
}
