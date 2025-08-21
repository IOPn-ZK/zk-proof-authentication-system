import { withCustomSecurity } from '../../../../lib/security/middleware.js';
import { db } from '../../../../lib/db/connection.js';
import { users } from '../../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const sub = req.session?.user?.sub || null;
  if (!sub) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

  // POST: demo self-promote flow (allowed in dev, or when explicitly enabled)
  if (req.method === 'POST') {
    const allow = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SELF_PROMOTE === 'true';
    if (!allow) return res.status(403).json({ success: false, error: 'DISABLED' });
    const found = await db.select().from(users).where(eq(users.auth0Sub, sub)).limit(1);
    if (found.length > 0) {
      await db.update(users).set({ isAdmin: true, updatedAt: new Date() }).where(eq(users.auth0Sub, sub));
    } else {
      await db.insert(users).values({ auth0Sub: sub, isAdmin: true, createdAt: new Date(), updatedAt: new Date() });
    }
  }

  // GET (and POST response): return status after any promotion
  const row = await db.select().from(users).where(eq(users.auth0Sub, sub)).limit(1);
  const isAdmin = row.length > 0 ? !!row[0].isAdmin : false;
  return res.status(200).json({ success: true, isAdmin, sub });
}

export default withCustomSecurity({ requireAuth: true, rateLimitType: 'status', allowedMethods: ['GET','POST'] })(handler);

