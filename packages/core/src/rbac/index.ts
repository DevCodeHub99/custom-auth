import { User } from '../interfaces';

export interface RBACConfig {
  roles: {
    [roleName: string]: {
      permissions: string[];
      inherits?: string[];
    };
  };
}

export class RBACManager {
  constructor(private config: RBACConfig) {}

  private getPermissionsForRole(role: string): Set<string> {
    const permissions = new Set<string>();
    const roleConfig = this.config.roles[role];

    if (!roleConfig) {
      return permissions;
    }

    roleConfig.permissions.forEach(p => permissions.add(p));

    if (roleConfig.inherits) {
      for (const inheritedRole of roleConfig.inherits) {
        const inheritedPermissions = this.getPermissionsForRole(inheritedRole);
        inheritedPermissions.forEach(p => permissions.add(p));
      }
    }

    return permissions;
  }

  hasPermission(user: User, permission: string): boolean {
    if (!user || !user.role) {
      return false;
    }

    const permissions = this.getPermissionsForRole(user.role);
    return permissions.has(permission);
  }
}
