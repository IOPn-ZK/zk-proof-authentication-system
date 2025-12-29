import { withCustomSecurity } from '../../../../lib/security/middleware.js';
import { db } from '../../../../lib/db/connection.js';
import { users } from '../../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const sub = req.session?.user?.sub || null;
    if (!sub) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    // POST: demo self-promote flow (allowed in dev, or when explicitly enabled)
    if (req.method === 'POST') {
      const allow = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SELF_PROMOTE === 'true';
      if (!allow) return res.status(403).json({ success: false, error: 'DISABLED' });
      
      try {
        const found = await db.select().from(users).where(eq(users.auth0Sub, sub)).limit(1);
        if (found.length > 0) {
          await db.update(users).set({ isAdmin: true, updatedAt: new Date() }).where(eq(users.auth0Sub, sub));
        } else {
          await db.insert(users).values({ auth0Sub: sub, isAdmin: true, createdAt: new Date(), updatedAt: new Date() });
        }
      } catch (dbError) {
        console.error('Database error in admin users self endpoint:', dbError);
        return res.status(500).json({ 
          success: false, 
          error: 'DATABASE_ERROR',
          message: 'Failed to update user status',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
    }

    // GET (and POST response): return status after any promotion
    try {
      const row = await db.select().from(users).where(eq(users.auth0Sub, sub)).limit(1);
      const isAdmin = row.length > 0 ? !!row[0].isAdmin : false;
      return res.status(200).json({ success: true, isAdmin, sub });
    } catch (dbError) {
      console.error('Database error fetching user status:', dbError);
      // Return default non-admin status if DB fails
      return res.status(200).json({ success: true, isAdmin: false, sub, warning: 'Database unavailable, defaulting to non-admin' });
    }
  } catch (error) {
    console.error('Unexpected error in admin users self endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default withCustomSecurity({ requireAuth: true, rateLimitType: 'status', allowedMethods: ['GET','POST'] })(handler);

