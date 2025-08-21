import { withSecurityConfig } from '../../../lib/security/middleware.js';
import { db } from '../../../lib/db/connection.js';
import { users, auditLog, userSessions } from '../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function handler(req, res) {
  if (!req.session?.roles?.isAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const { userSub } = req.query;
  if (!userSub) return res.status(400).json({ success: false, error: 'SUB_REQUIRED' });
  const u = await db.select().from(users).where(eq(users.auth0Sub, userSub)).limit(1);
  const logs = await db.select().from(auditLog).where(eq(auditLog.userSub, userSub));
  const sessions = await db.select().from(userSessions).where(eq(userSessions.identityCommitment, null));
  return res.status(200).json({ success: true, data: { user: u[0] || null, logs, sessions } });
}

export default withSecurityConfig('groupData')(handler);

