import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { db } from '../../../../lib/db/connection.js';
import { users } from '../../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function handler(req, res) {
  if (!req.session?.roles?.isAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const { auth0Sub, isAdmin } = req.body || {};
  if (!auth0Sub) return res.status(400).json({ success: false, error: 'SUB_REQUIRED' });
  const found = await db.select().from(users).where(eq(users.auth0Sub, auth0Sub)).limit(1);
  if (found.length > 0) {
    await db.update(users).set({ isAdmin: !!isAdmin, updatedAt: new Date() }).where(eq(users.auth0Sub, auth0Sub));
  } else {
    await db.insert(users).values({ auth0Sub, isAdmin: !!isAdmin, createdAt: new Date(), updatedAt: new Date() });
  }
  return res.status(200).json({ success: true });
}

export default withSecurityConfig('groupMember')(handler);

