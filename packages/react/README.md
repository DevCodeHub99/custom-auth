# @custom-auth/react

---

### 📦 Ecosystem Packages
* 🔑 **[Core Engine (@custom-auth/core)](https://www.npmjs.com/package/@custom-auth/core)** — The core framework-agnostic auth engine.
* ⚛️ **[React SDK (@custom-auth/react)](https://www.npmjs.com/package/@custom-auth/react)** — React hooks and context provider.
* 🌐 **[Next.js SDK (@custom-auth/nextjs)](https://www.npmjs.com/package/@custom-auth/nextjs)** — Edge-compatible Next.js helpers and middleware.
* 🗄️ **Database Adapters:**
  * [Prisma (@custom-auth/prisma)](https://www.npmjs.com/package/@custom-auth/prisma)
  * [Drizzle (@custom-auth/drizzle)](https://www.npmjs.com/package/@custom-auth/drizzle)
  * [Mongoose (@custom-auth/mongoose)](https://www.npmjs.com/package/@custom-auth/mongoose)
* ✉️ **Email Adapters:**
  * [Nodemailer (@custom-auth/adapter-nodemailer)](https://www.npmjs.com/package/@custom-auth/adapter-nodemailer)
  * [Resend (@custom-auth/adapter-resend)](https://www.npmjs.com/package/@custom-auth/adapter-resend)

---


React hooks and context providers for seamlessly integrating `@custom-auth` into your React applications.

## Installation

The React SDK works alongside the core engine. You also need to install your chosen database and email adapters on your backend:

```bash
# General Format
npm install @custom-auth/core @custom-auth/react <your-db-adapter> <your-email-adapter>

# Example
npm install @custom-auth/core @custom-auth/react @custom-auth/prisma @custom-auth/adapter-resend
```

## Quick Start

Wrap your application in the `AuthProvider` and use the provided hooks anywhere in your component tree.

```tsx
import { AuthProvider, useAuth } from '@custom-auth/react';

function App() {
  return (
    <AuthProvider>
      <UserProfile />
    </AuthProvider>
  );
}

function UserProfile() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <div>Please log in</div>;

  return <div>Welcome back, {user.name ?? user.email}!</div>;
}
```

## Detailed Documentation

### `AuthProvider`

Wrap your root component with the `AuthProvider` to enable the auth context.

```tsx
import { AuthProvider } from '@custom-auth/react';

export default function RootLayout({ children }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
```

### `useAuth` Hook

Access the current user session and authentication methods from anywhere in your app.

```tsx
import { useAuth } from '@custom-auth/react';

function Profile() {
  const { user, isLoading, signIn, signUp, signOut } = useAuth();

  if (isLoading) return <p>Loading...</p>;
  if (!user) return <p>You are not logged in.</p>;

  return (
    <div>
      <h1>Welcome, {user.name ?? user.email}</h1>
      <button onClick={() => signOut()}>Logout</button>
    </div>
  );
}
```

### `useOtp` Hook

Request and verify email one-time passwords (OTP).

```tsx
import { useOtp } from '@custom-auth/react';
import { useState } from 'react';

function OtpLogin() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const { requestOtp, verifyOtp, sent, isLoading, error } = useOtp();

  const handleRequest = async () => {
    await requestOtp(email);
  };

  const handleVerify = async () => {
    const { user } = await verifyOtp(email, code);
    console.log('Logged in user:', user);
  };

  return (
    <div>
      {!sent ? (
        <div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
          <button onClick={handleRequest} disabled={isLoading}>Send Code</button>
        </div>
      ) : (
        <div>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" />
          <button onClick={handleVerify} disabled={isLoading}>Verify & Login</button>
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

## Documentation

For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).

