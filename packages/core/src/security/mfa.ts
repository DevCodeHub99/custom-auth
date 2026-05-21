import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { User, DatabaseAdapter } from '../interfaces';

export class MFA {
  constructor(private adapter: DatabaseAdapter, private appName: string = 'CustomAuth') {}

  async generateSecret(user: User): Promise<{ secret: string; qrCodeUrl: string }> {
    const secret = speakeasy.generateSecret({
      name: `${this.appName} (${user.email})`,
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    // Optional: We can update the user to store the temp secret here
    // But usually you wait to verify it before storing it.
    
    return {
      secret: secret.base32,
      qrCodeUrl,
    };
  }

  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // allow 1 window of 30 seconds before and after
    });
  }

  async enableMFA(userId: string, secret: string, token: string): Promise<boolean> {
    const isValid = this.verifyToken(secret, token);
    
    if (isValid && this.adapter.updateUser) {
      // Store the verified secret in the DB
      await this.adapter.updateUser(userId, { mfaSecret: secret, mfaEnabled: true });
      return true;
    }
    
    return false;
  }
}
