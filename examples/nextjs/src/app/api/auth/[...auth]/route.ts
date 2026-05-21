import { createAuth } from '@custom-auth/core';
import { PrismaAdapter } from '@custom-auth/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const auth = createAuth({
  secret: process.env.AUTH_SECRET ?? 'change-me-in-production-32-chars!!',
  adapter: new PrismaAdapter(prisma),
  emailVerification: true,
  verifyEmailUrl:   `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/verify-email`,
  resetPasswordUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/reset-password`,
  ...(process.env.GOOGLE_CLIENT_ID && {
    providers: [
      {
        id: 'google',
        name: 'Google',
        type: 'oauth' as const,
        clientId:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      ...(process.env.GITHUB_CLIENT_ID ? [{
        id: 'github',
        name: 'GitHub',
        type: 'oauth' as const,
        clientId:     process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      }] : []),
    ],
  }),
  session: { expiresIn: '7d' },
});

export const GET  = (req: Request) => auth.handleRequest(req);
export const POST = (req: Request) => auth.handleRequest(req);
export const dynamic = 'force-dynamic';
