import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { db } from '../../../../lib/db/connection.js';
import { groups, groupMembers, userSessions, rateLimits, auditLog, users } from '../../../../lib/db/schema.js';

async function handler(req, res) {
  if (!req.session?.roles?.isAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const [g, gm, us, rl, al, u] = await Promise.all([
    db.select().from(groups),
    db.select().from(groupMembers),
    db.select().from(userSessions),
    db.select().from(rateLimits),
    db.select().from(auditLog),
    db.select().from(users),
  ]);
  // do not return encrypted email blob verbatim to UI, keep it but flag
  const auditSafe = al.map(({ userEmailEnc, ...rest }) => ({ ...rest, hasEmail: !!userEmailEnc }));
  return res.status(200).json({ success: true, data: { groups: g, groupMembers: gm, userSessions: us, rateLimits: rl, auditLog: auditSafe, users: u } });
}

export default withSecurityConfig('groupData')(handler);

