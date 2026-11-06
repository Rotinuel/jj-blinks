// Central permission map. Every protected server action and admin page calls
// requirePermission() (lib/auth.js) with one of these names; hiding buttons is cosmetic only.

export const ROLES = ['super_admin', 'admin', 'inventory_manager', 'order_manager', 'customer'];
export const STAFF_ROLES = ['super_admin', 'admin', 'inventory_manager', 'order_manager'];

export const ROLE_LABELS = {
  super_admin: 'Super admin',
  admin: 'Admin',
  inventory_manager: 'Inventory manager',
  order_manager: 'Order manager',
  customer: 'Customer',
};

const ALL = [
  'dashboard.view',
  'finance.view',          // revenue figures, analytics
  'products.view',
  'products.edit',
  'products.delete',
  'products.cost',         // internal cost prices
  'categories.manage',
  'inventory.manage',
  'media.upload',
  'orders.view',
  'orders.update',
  'orders.refund',
  'customers.view',
  'customers.manage',
  'coupons.manage',
  'reviews.moderate',
  'custom.view',
  'custom.manage',
  'custom.quote',
  'shipping.manage',
  'content.manage',
  'settings.manage',
  'settings.payments',
  'staff.manage',
  'audit.view',
  'messages.view',
];

export const PERMISSIONS = {
  super_admin: ALL,
  admin: ALL.filter((p) => !['staff.manage', 'settings.payments'].includes(p)),
  inventory_manager: [
    'dashboard.view', 'products.view', 'products.edit', 'categories.manage', 'inventory.manage', 'media.upload',
    'reviews.moderate',
  ],
  order_manager: [
    'dashboard.view', 'orders.view', 'orders.update', 'customers.view', 'custom.view', 'custom.manage',
    'products.view', 'messages.view',
  ],
  customer: [],
};

export function can(role, permission) {
  return Boolean(role && PERMISSIONS[role]?.includes(permission));
}

export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

/** Who may assign which roles. Only super admins manage staff; nobody can mint a super admin except a super admin. */
export function canAssignRole(actorRole, targetRole) {
  return actorRole === 'super_admin' && ROLES.includes(targetRole);
}
