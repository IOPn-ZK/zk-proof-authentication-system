import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { db } from '../../../../lib/db/connection.js';
import { auditLog } from '../../../../lib/db/schema.js';
import { desc } from 'drizzle-orm';

async function handler(req, res) {
  if (!req.session?.roles?.isAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }

  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(100);
  const sanitized = rows.map(({ userEmailEnc, ...rest }) => rest);
  return res.status(200).json({ success: true, logs: sanitized });
}

export default withSecurityConfig('groupData')(handler);

