import { PrismaClient } from '@prisma/client';
import { DatabaseAdapter, User, Session, VerificationToken, CreateUserInput, UpdateUserInput, Authenticator } from '@custom-auth/core';

export class PrismaAdapter implements DatabaseAdapter {
  constructor(private prisma: PrismaClient) {}

  async createUser(data: CreateUserInput): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role ?? 'user',
        emailVerified: data.emailVerified ?? false,
      },
    });
    return user as unknown as User;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? (user as unknown as User) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? (user as unknown as User) : null;
  }

  async updateUser(idOrEmail: string, data: UpdateUserInput): Promise<User> {
    const where = idOrEmail.includes('@') ? { email: idOrEmail } : { id: idOrEmail };
    const user = await this.prisma.user.update({ where, data });
    return user as unknown as User;
  }

  async createSession(userId: string, expiresAt: Date): Promise<Session> {
    const session = await this.prisma.session.create({ data: { userId, expiresAt } });
    return session as unknown as Session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    return session ? (session as unknown as Session) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async createVerificationToken(data: VerificationToken): Promise<void> {
    await (this.prisma as any).verificationToken.create({ data });
  }

  async getVerificationToken(
    token: string,
    type: VerificationToken['type']
  ): Promise<VerificationToken | null> {
    const record = await (this.prisma as any).verificationToken.findFirst({
      where: { token, type },
    });
    return record ?? null;
  }

  async deleteVerificationToken(
    token: string,
    type: VerificationToken['type']
  ): Promise<void> {
    await (this.prisma as any).verificationToken.deleteMany({
      where: { token, type },
    });
  }

  async createAuthenticator(data: Authenticator): Promise<void> {
    await (this.prisma as any).authenticator.create({ data });
  }

  async getAuthenticatorById(credentialID: string): Promise<Authenticator | null> {
    const record = await (this.prisma as any).authenticator.findUnique({
      where: { credentialID },
    });
    return record ? (record as unknown as Authenticator) : null;
  }

  async listAuthenticatorsByUserId(userId: string): Promise<Authenticator[]> {
    const records = await (this.prisma as any).authenticator.findMany({
      where: { userId },
    });
    return records as unknown as Authenticator[];
  }

  async updateAuthenticatorCounter(credentialID: string, counter: number): Promise<void> {
    await (this.prisma as any).authenticator.updateMany({
      where: { credentialID, counter: { lt: counter } },
      data: { counter },
    });
  }
}
