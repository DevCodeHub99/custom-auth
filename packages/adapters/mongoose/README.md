# @custom-auth/mongoose

The official Mongoose (MongoDB) adapter for `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/mongoose mongoose
```

## Quick Start

```typescript
import { CustomAuth } from '@custom-auth/core';
import { MongooseAdapter } from '@custom-auth/mongoose';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);

export const auth = new CustomAuth({
  db: new MongooseAdapter(),
  // ...other config
});
```

## Documentation
For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
