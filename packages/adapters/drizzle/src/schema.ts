/**
 * @custom-auth/drizzle — ready-to-use schema definitions
 *
 * Import and re-export these in your app's schema file, then pass them
 * to DrizzleAdapter:
 *
 *   import { usersTable, sessionsTable, verificationTokensTable } from '@custom-auth/drizzle/schema';
 *
 *   const adapter = new DrizzleAdapter({
 *     db,
 *     usersTable,
 *     sessionsTable,
 *     verificationTokensTable,
 *   });
 *
 * Or extend them:
 *   import { usersTable as baseUsersTable } from '@custom-auth/drizzle/schema';
 *   export const usersTable = pgTable('users', {
 *     ...baseUsersTable,
 *     stripeCustomerId: text('stripe_customer_id'),
 *   });
 */

import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ── users ─────────────────────────────────────────────────────────────────

export const usersTable = pgTable('auth_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('user'),
  emailVerified: boolean('email_verified').notNull().default(false),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: text('mfa_secret'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type UserRow = typeof usersTable.$inferSelect;
export type NewUserRow = typeof usersTable.$inferInsert;

// ── sessions ──────────────────────────────────────────────────────────────

export const sessionsTable = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type SessionRow = typeof sessionsTable.$inferSelect;
export type NewSessionRow = typeof sessionsTable.$inferInsert;

// ── verification_tokens ───────────────────────────────────────────────────

export const verificationTokensTable = pgTable('auth_verification_tokens', {
  token: text('token').primaryKey(),
  email: text('email').notNull(),
  /**
   * 'magic-link' | 'email-verify' | 'password-reset' | 'mfa-pending'
   */
  type: text('type').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type VerificationTokenRow = typeof verificationTokensTable.$inferSelect;
export type NewVerificationTokenRow = typeof verificationTokensTable.$inferInsert;
