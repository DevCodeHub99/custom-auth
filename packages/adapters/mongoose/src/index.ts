import mongoose, { Schema, Model } from 'mongoose';
import { DatabaseAdapter, User, Session, VerificationToken, CreateUserInput, UpdateUserInput, Authenticator } from '@custom-auth/core';

export const UserSchema = new Schema(
  {
    email:         { type: String, required: true, unique: true },
    name:          { type: String },
    passwordHash:  { type: String },
    role:          { type: String, default: 'user' },
    emailVerified: { type: Boolean, default: false },
    mfaEnabled:    { type: Boolean, default: false },
    mfaSecret:     { type: String },
  },
  { timestamps: true }
);

export const SessionSchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const VerificationTokenSchema = new Schema(
  {
    token:     { type: String, required: true, unique: true },
    email:     { type: String, required: true },
    type:      { type: String, required: true }, // 'magic-link' | 'email-verify' | 'password-reset'
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
VerificationTokenSchema.index({ email: 1, type: 1 });

export const AuthenticatorSchema = new Schema(
  {
    credentialID:         { type: String, required: true, unique: true },
    credentialPublicKey:  { type: String, required: true },
    counter:              { type: Number, required: true },
    transports:           { type: String },
    userId:               { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    credentialDeviceType: { type: String, required: true },
    credentialBackedUp:   { type: Boolean, required: true },
  },
  { timestamps: true }
);
AuthenticatorSchema.index({ userId: 1 });

export interface MongooseConfig {
  UserModel?: Model<any>;
  SessionModel?: Model<any>;
  VerificationTokenModel?: Model<any>;
  AuthenticatorModel?: Model<any>;
}

export class MongooseAdapter implements DatabaseAdapter {
  private userModel: Model<any>;
  private sessionModel: Model<any>;
  private verificationTokenModel: Model<any>;
  private authenticatorModel: Model<any>;

  constructor(config?: MongooseConfig) {
    this.userModel =
      config?.UserModel ??
      (mongoose.models['User'] || mongoose.model('User', UserSchema));
    this.sessionModel =
      config?.SessionModel ??
      (mongoose.models['Session'] || mongoose.model('Session', SessionSchema));
    this.verificationTokenModel =
      config?.VerificationTokenModel ??
      (mongoose.models['VerificationToken'] ||
        mongoose.model('VerificationToken', VerificationTokenSchema));
    this.authenticatorModel =
      config?.AuthenticatorModel ??
      (mongoose.models['Authenticator'] ||
        mongoose.model('Authenticator', AuthenticatorSchema));
  }

  private mapUser(doc: any): User {
    return {
      id:            doc._id.toString(),
      email:         doc.email,
      name:          doc.name,
      passwordHash:  doc.passwordHash,
      role:          doc.role,
      emailVerified: doc.emailVerified,
      mfaEnabled:    doc.mfaEnabled,
      mfaSecret:     doc.mfaSecret,
    };
  }

  private mapSession(doc: any): Session {
    return {
      id:        doc._id.toString(),
      userId:    doc.userId.toString(),
      expiresAt: doc.expiresAt,
    };
  }

  async createUser(data: CreateUserInput): Promise<User> {
    const user = await this.userModel.create({
      email:         data.email,
      name:          data.name,
      passwordHash:  data.passwordHash,
      role:          data.role ?? 'user',
      emailVerified: data.emailVerified ?? false,
    });
    return this.mapUser(user);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = await this.userModel.findOne({ email });
    return user ? this.mapUser(user) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const user = await this.userModel.findById(id);
    return user ? this.mapUser(user) : null;
  }

  async updateUser(idOrEmail: string, data: UpdateUserInput): Promise<User> {
    const query = idOrEmail.includes('@')
      ? this.userModel.findOneAndUpdate({ email: idOrEmail }, data, { new: true })
      : this.userModel.findByIdAndUpdate(idOrEmail, data, { new: true });
    const user = await query;
    if (!user) throw new Error('User not found');
    return this.mapUser(user);
  }

  async createSession(userId: string, expiresAt: Date): Promise<Session> {
    const session = await this.sessionModel.create({ userId, expiresAt });
    return this.mapSession(session);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const session = await this.sessionModel.findById(sessionId);
    return session ? this.mapSession(session) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionModel.findByIdAndDelete(sessionId);
  }

  async createVerificationToken(data: VerificationToken): Promise<void> {
    await this.verificationTokenModel.create(data);
  }

  async getVerificationToken(
    token: string,
    type: VerificationToken['type']
  ): Promise<VerificationToken | null> {
    const record = await this.verificationTokenModel.findOne({ token, type });
    if (!record) return null;
    return {
      token:     record.token,
      email:     record.email,
      type:      record.type,
      expiresAt: record.expiresAt,
    };
  }

  async deleteVerificationToken(
    token: string,
    type: VerificationToken['type']
  ): Promise<void> {
    await this.verificationTokenModel.deleteMany({ token, type });
  }

  async createAuthenticator(data: Authenticator): Promise<void> {
    await this.authenticatorModel.create({
      credentialID: data.credentialID,
      credentialPublicKey: data.credentialPublicKey,
      counter: data.counter,
      transports: data.transports,
      userId: data.userId,
      credentialDeviceType: data.credentialDeviceType,
      credentialBackedUp: data.credentialBackedUp,
    });
  }

  async getAuthenticatorById(credentialID: string): Promise<Authenticator | null> {
    const record = await this.authenticatorModel.findOne({ credentialID });
    if (!record) return null;
    return {
      credentialID: record.credentialID,
      credentialPublicKey: record.credentialPublicKey,
      counter: record.counter,
      transports: record.transports,
      userId: record.userId.toString(),
      credentialDeviceType: record.credentialDeviceType,
      credentialBackedUp: record.credentialBackedUp,
    };
  }

  async listAuthenticatorsByUserId(userId: string): Promise<Authenticator[]> {
    const records = await this.authenticatorModel.find({ userId });
    return records.map(record => ({
      credentialID: record.credentialID,
      credentialPublicKey: record.credentialPublicKey,
      counter: record.counter,
      transports: record.transports,
      userId: record.userId.toString(),
      credentialDeviceType: record.credentialDeviceType,
      credentialBackedUp: record.credentialBackedUp,
    }));
  }

  async updateAuthenticatorCounter(credentialID: string, counter: number): Promise<void> {
    await this.authenticatorModel.updateOne({ credentialID }, { counter });
  }
}
