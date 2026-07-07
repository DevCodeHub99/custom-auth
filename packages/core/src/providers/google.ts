import { OAuthProvider, OAuthConfig } from './oauth';

export class GoogleProvider extends OAuthProvider {
  id = 'google';
  name = 'Google';

  constructor(config: OAuthConfig) {
    super(config);
  }

  getAuthorizationUrl(state: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.append('client_id', this.config.clientId);
    url.searchParams.append('redirect_uri', this.config.redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', 'openid email profile');
    url.searchParams.append('access_type', 'offline');
    url.searchParams.append('state', state);
    return url.toString();
  }

  async getTokens(code: string): Promise<{ accessToken: string; idToken?: string; refreshToken?: string }> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch Google tokens: ${body}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
    };
  }

  async getUserProfile(accessToken: string): Promise<{ id: string; email: string; name?: string; image?: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Google user profile');
    }

    const data = await response.json();

    if (!data.email_verified) {
      throw new Error('Google account email is not verified. Please verify your Google email first.');
    }

    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      image: data.picture,
    };
  }
}
