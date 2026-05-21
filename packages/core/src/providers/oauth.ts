import { Provider } from '../interfaces';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export abstract class OAuthProvider implements Provider {
  abstract id: string;
  abstract name: string;
  type: 'oauth' = 'oauth';

  constructor(protected config: OAuthConfig) {}

  /**
   * Returns the authorization URL to redirect the user to.
   * @param state — CSRF state token; must be included in the URL and verified on callback
   */
  abstract getAuthorizationUrl(state: string): string;
  abstract getTokens(code: string): Promise<{ accessToken: string; idToken?: string; refreshToken?: string }>;
  abstract getUserProfile(accessToken: string): Promise<{ id: string; email: string; name?: string; image?: string }>;
}
