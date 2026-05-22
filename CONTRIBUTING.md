# Contributing to Custom Auth

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to `@custom-auth`. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Development Setup

We use npm workspaces to manage this monorepo.

1. **Fork** and **clone** the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build all packages:
   ```bash
   npm run build
   ```

## Creating a new Adapter

To create a new adapter (database or email), follow the existing structure in `packages/adapters/`. 
Ensure your adapter implements the standard interfaces provided by `@custom-auth/core`.

## Submitting Pull Requests

1. Create a new branch: `git checkout -b feature/my-feature`
2. Make your changes and commit them: `git commit -m "feat: my new feature"`
3. Push to the branch: `git push origin feature/my-feature`
4. Submit a Pull Request.

Please make sure all tests pass and your code is properly linted before submitting.
