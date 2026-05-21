import { describe, it, expect, beforeEach } from 'vitest';
import { RBACManager, RoleConfig } from '../src/rbac';
import { User } from '../src/interfaces';

describe('RBACManager', () => {
  const roles: Record<string, RoleConfig> = {
    user: {
      permissions: ['read:profile'],
    },
    admin: {
      permissions: ['read:profile', 'write:profile', 'delete:users'],
    },
    superadmin: {
      inherits: ['admin'],
      permissions: ['manage:system'],
    }
  };

  const rbac = new RBACManager({ roles });

  it('should grant permission to exact role', () => {
    const user: User = { id: '1', email: 'test@example.com', role: 'admin' };
    expect(rbac.hasPermission(user, 'write:profile')).toBe(true);
  });

  it('should deny permission if role lacks it', () => {
    const user: User = { id: '2', email: 'user@example.com', role: 'user' };
    expect(rbac.hasPermission(user, 'write:profile')).toBe(false);
  });

  it('should grant inherited permissions', () => {
    const user: User = { id: '3', email: 'super@example.com', role: 'superadmin' };
    expect(rbac.hasPermission(user, 'delete:users')).toBe(true);
    expect(rbac.hasPermission(user, 'manage:system')).toBe(true);
  });

  it('should deny if role does not exist', () => {
    const user: User = { id: '4', email: 'guest@example.com', role: 'guest' };
    expect(rbac.hasPermission(user, 'read:profile')).toBe(false);
  });
});
