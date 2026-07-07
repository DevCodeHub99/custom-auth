import { DatabaseAdapter, User, Session, VerificationToken, CreateUserInput, UpdateUserInput, Authenticator } from '@custom-auth/core';

// Re-export schema for use in consumer apps
export * from './schema';
import { eq, and, lt } from 'drizzle-orm';

export interface DrizzleConfig {
  db: any;
  usersTable: any;
  sessionsTable?: any;
  verificationTokensTable?: any;
  authenticatorsTable?: any;
}

export class DrizzleAdapter implements DatabaseAdapter {
  private db: any;
  private usersTable: any;
  private sessionsTable: any;
  private verificationTokensTable: any;
  private authenticatorsTable: any;

  constructor(config: DrizzleConfig) {
    this.db = config.db;
    this.usersTable = config.usersTable;
    this.sessionsTable = config.sessionsTable;
    this.verificationTokensTable = config.verificationTokensTable;
    this.authenticatorsTable = config.authenticatorsTable;
  }

  async createUser(data: CreateUserInput): Promise<User> {
    const [user] = await this.db
      .insert(this.usersTable)
      .values({
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role ?? 'user',
        emailVerified: data.emailVerified ?? false,
      })
      .returning();
    return user as User;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(this.usersTable)
      .where(eq(this.usersTable.email, email));
    return (user as User) ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(this.usersTable)
      .where(eq(this.usersTable.id, id));
    return (user as User) ?? null;
  }

  async updateUser(idOrEmail: string, data: UpdateUserInput): Promise<User> {
    const where = idOrEmail.includes('@')
      ? eq(this.usersTable.email, idOrEmail)
      : eq(this.usersTable.id, idOrEmail);
    const [user] = await this.db
      .update(this.usersTable)
      .set(data)
      .where(where)
      .returning();
    if (!user) throw new Error('User not found');
    return user as User;
  }

  async createSession(userId: string, expiresAt: Date): Promise<Session> {
    if (!this.sessionsTable) throw new Error('sessionsTable not provided to DrizzleAdapter');
    const [session] = await this.db
      .insert(this.sessionsTable)
      .values({ userId, expiresAt })
      .returning();
    return session as Session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.sessionsTable) throw new Error('sessionsTable not provided to DrizzleAdapter');
    const [session] = await this.db
      .select()
      .from(this.sessionsTable)
      .where(eq(this.sessionsTable.id, sessionId));
    return (session as Session) ?? null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.sessionsTable) throw new Error('sessionsTable not provided to DrizzleAdapter');
    await this.db
      .delete(this.sessionsTable)
      .where(eq(this.sessionsTable.id, sessionId));
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    if (!this.sessionsTable) throw new Error('sessionsTable not provided to DrizzleAdapter');
    await this.db
      .delete(this.sessionsTable)
      .where(eq(this.sessionsTable.userId, userId));
  }

  async createVerificationToken(data: VerificationToken): Promise<void> {
    if (!this.verificationTokensTable) throw new Error('verificationTokensTable not provided to DrizzleAdapter');
    await this.db.insert(this.verificationTokensTable).values(data);
  }

  async getVerificationToken(
    token: string,
    type: VerificationToken['type']
  ): Promise<VerificationToken | null> {
    if (!this.verificationTokensTable) throw new Error('verificationTokensTable not provided to DrizzleAdapter');
    const [record] = await this.db
      .select()
      .from(this.verificationTokensTable)
      .where(
        and(
          eq(this.verificationTokensTable.token, token),
          eq(this.verificationTokensTable.type, type)
        )
      );
    return (record as VerificationToken) ?? null;
  }

  async deleteVerificationToken(
    token: string,
    type: VerificationToken['type']
  ): Promise<void> {
    if (!this.verificationTokensTable) throw new Error('verificationTokensTable not provided to DrizzleAdapter');
    await this.db
      .delete(this.verificationTokensTable)
      .where(
        and(
          eq(this.verificationTokensTable.token, token),
          eq(this.verificationTokensTable.type, type)
        )
      );
  }

  async createAuthenticator(data: Authenticator): Promise<void> {
    if (!this.authenticatorsTable) throw new Error('authenticatorsTable not provided to DrizzleAdapter');
    await this.db.insert(this.authenticatorsTable).values(data);
  }

  async getAuthenticatorById(credentialID: string): Promise<Authenticator | null> {
    if (!this.authenticatorsTable) throw new Error('authenticatorsTable not provided to DrizzleAdapter');
    const [record] = await this.db
      .select()
      .from(this.authenticatorsTable)
      .where(eq(this.authenticatorsTable.credentialID, credentialID));
    return (record as Authenticator) ?? null;
  }

  async listAuthenticatorsByUserId(userId: string): Promise<Authenticator[]> {
    if (!this.authenticatorsTable) throw new Error('authenticatorsTable not provided to DrizzleAdapter');
    const records = await this.db
      .select()
      .from(this.authenticatorsTable)
      .where(eq(this.authenticatorsTable.userId, userId));
    return records as Authenticator[];
  }

  async updateAuthenticatorCounter(credentialID: string, counter: number): Promise<void> {
    if (!this.authenticatorsTable) throw new Error('authenticatorsTable not provided to DrizzleAdapter');
    await this.db
      .update(this.authenticatorsTable)
      .set({ counter })
      .where(
        and(
          eq(this.authenticatorsTable.credentialID, credentialID),
          lt(this.authenticatorsTable.counter, counter)
        )
      );
  }
}
