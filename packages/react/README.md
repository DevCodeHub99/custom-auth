# @custom-auth/react

React hooks and context providers for seamlessly integrating `@custom-auth` into your React applications.

## Installation

```bash
npm install @custom-auth/core @custom-auth/react
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
  const { session, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!session) return <div>Please log in</div>;

  return <div>Welcome back, {session.user.name}!</div>;
}
```

## Documentation
For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
