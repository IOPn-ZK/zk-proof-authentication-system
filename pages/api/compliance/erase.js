import { withSecurityConfig } from '../../../lib/security/middleware.js';
import { db } from '../../../lib/db/connection.js';
import { users, auditLog, userSessions } from '../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function handler(req, res) {
  if (!req.session?.roles?.isAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const { userSub } = req.body || {};
  if (!userSub) return res.status(400).json({ success: false, error: 'SUB_REQUIRED' });

  await db.delete(auditLog).where(eq(auditLog.userSub, userSub));
  await db.delete(users).where(eq(users.auth0Sub, userSub));
  // Sessions: deactivate rather than delete for security traceability
  await db.execute`UPDATE user_sessions SET is_active = false, updated_at = NOW() WHERE session_id IN (
    SELECT session_id FROM audit_log WHERE user_sub = ${userSub}
  )`;
  return res.status(200).json({ success: true });
}

export default withSecurityConfig('groupMember')(handler);

