# 🛡️ Architectural Audit: @custom-auth NPM Package Ecosystem

Through debugging, stabilizing, and hosting **SecureAuthX** in a live production environment, we identified several structural weaknesses and critical flaws within the `@custom-auth` libraries (`@custom-auth/core`, `@custom-auth/react`, and `@custom-auth/mongoose`).

Below is the technical breakdown of these flaws alongside the recommended architectural improvements for the package maintainers.

---

## 1. WebAuthn Credential ID Double-Encoding Bug
*   **The Component**: `@custom-auth/mongoose` (Database Adapter layer)
*   **The Weakness**: When saving or searching biometric credentials, the adapter double-encodes the credential IDs (saving them as the `base64url` representation of an already-encoded `base64url` string). This causes lookup mismatches when standard WebAuthn browser payloads request authentication, failing with "Credential not found" errors.
*   **The Impact**: Biometric Passkeys fail to authenticate out of the box unless developers override the adapter methods.
*   **Area of Improvement**: The database adapter must check the type and encoding of incoming `credentialID` parameters. It should unpack/decode them once to a standard binary Buffer or a normalized string representation before committing to the DB, ensuring consistency.

---

## 2. Hard Cookie-Only Session Dependency (No Bearer Header Support)
*   **The Component**: `@custom-auth/react` & `@custom-auth/core`
*   **The Weakness**: The React SDK hooks assume session tracking is purely cookie-based. It does not extract or store the session token in `localStorage`, nor does it append an `Authorization` header to fetch calls.
*   **The Impact**: 
    *   **Third-Party Cookie Blocking**: Modern browsers (Chrome, Safari ITP, Brave) block third-party cookies by default. When the client is on `client.vercel.app` and the server is on `server.vercel.app`, the session cookie is blocked, and the app repeatedly redirects to the login screen.
    *   **Proxy Stripping**: Serverless hosting edge proxies (like Vercel or Cloudflare) sometimes drop or strip headers during cross-origin CORS preflight check routing.
*   **Area of Improvement**: 
    *   The React hooks (`useSignIn`, `useOtp`, `useMfa`, etc.) should extract the JWT token from the backend JSON response and cache it locally.
    *   The SDK's fetch manager should automatically append `Authorization: Bearer <token>` to requests.
    *   The backend middlewares should natively verify both cookies and Authorization headers.

---

## 3. Asynchronous Cookie-Write Race Conditions on Refresh
*   **The Component**: `@custom-auth/react` (`AuthProvider` layer)
*   **The Weakness**: Once a login, MFA, or OTP validation endpoint resolves and returns a `Set-Cookie` header, the React SDK immediately calls `refresh()` (fetching `/session`) to update the application context.
*   **The Impact**: The browser's cookie engine often takes a few milliseconds to persist the cookie to disk. If the `/session` request is sent before this completes, the request lacks the cookie, the server returns 401, and the app clears the session state, redirecting the user back to the login screen.
*   **Area of Improvement**:
    *   **Instant Context Hydration**: The authentication hooks should directly set the `user` state inside the React context using the user payload returned by the `/login` or `/verify` response, rather than making an immediate round-trip fetch.
    *   **Write Debounce**: Introduce a slight wait window or event listener inside `refresh` calls to ensure cookies are persistent.

---

## 4. Non-Compliant TOTP QR-Code Setup URIs
*   **The Component**: `@custom-auth/core` (MFA flow layer)
*   **The Weakness**: When creating a new Multi-Factor Authentication token, the core library generates raw TOTP Auth URIs containing unencoded characters (spaces, colons, brackets, or `@` symbols) in the label or issuer fields.
*   **The Impact**: Authenticator applications (like Microsoft Authenticator, Google Authenticator, and Oracle Authenticator) reject these URIs, showing "Configuration URL is invalid" and preventing users from scanning the QR code.
*   **Area of Improvement**: Apply strict RFC 3986 URL encoding (`encodeURIComponent`) to both the `label` and `issuer` fields in the generated `otpauth://totp/` URI.

---

## 5. Lack of Standard Profile Management Hooks
*   **The Component**: `@custom-auth/react` & `@custom-auth/core`
*   **The Weakness**: The package abstracts sign-up, login, and MFA, but provides no built-in wrapper for updating passwords, emails, or names once the user is authenticated.
*   **The Impact**: Developers are forced to construct custom Express routes, manually check password hashes, complexity, and reuse, duplicating logic.
*   **Area of Improvement**: Expose standard handlers and React hooks for password and profile modifications (e.g. `useUpdatePassword()`) that verify complexity, enforce verification of the current password, and block re-entry of the old password.
