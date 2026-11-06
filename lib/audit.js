import { json, query } from './db.js';

/** Append-only audit trail for administrative actions. Never store secrets in `details`. */
export async function audit(actor, action, { entityType = null, entityId = null, details = {}, ip = null } = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, actor_email, action, entity_type, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actor?.id ?? null, actor?.email ?? null, action, entityType, entityId === null ? null : String(entityId), json(details), ip]
    );
  } catch (err) {
    // Auditing must not break the action itself, but the failure should be visible in logs.
    console.error('audit log write failed', action, err?.message);
  }
}
