import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { db } from '../../../../lib/db/connection.js';
import { auditLog } from '../../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../../../../lib/security/encryption.js';

async function handler(req, res) {
  if (!req.session?.roles?.isAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const { id } = req.query;
  const rows = await db.select().from(auditLog).where(eq(auditLog.id, Number(id))).limit(1);
  if (rows.length === 0) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
  const row = rows[0];
  let email = null;
  if (row.userEmailEnc) {
    try { email = decrypt(JSON.parse(row.userEmailEnc)); } catch {}
  }
  return res.status(200).json({ success: true, log: { ...row, userEmail: email } });
}

export default withSecurityConfig('groupData')(handler);

