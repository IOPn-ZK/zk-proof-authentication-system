import { addMemberToGroup } from '../../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { getTenantId } from '../../../../lib/security/tenant.js';

async function handler(req, res) {
  try {
    console.log('POST /api/zk/group/members-pg - Starting PostgreSQL-based request processing');
    
    const userEmail = req.session.user.email;
    const userSub = req.session.user.sub;
    const tenantId = getTenantId(req);
    const { commitment } = req.body; 
    
    console.log('User authenticated:', userEmail);
    console.log('Adding member with commitment:', commitment);
    
    const result = await addMemberToGroup(1, commitment, userEmail, req.session.id, userSub, tenantId);
    console.log('addMemberToGroup result:', result);
    
    if (result) {
      console.log('Member added successfully');
      res.status(200).json({ 
        success: true,
        message: 'Member added to group successfully',
        commitment: commitment,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('Member already exists in group');
      res.status(200).json({ 
        success: true,
        message: 'Member already exists in group',
        commitment: commitment,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Error in /api/zk/group/members-pg:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Error adding member to group', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

export default withSecurityConfig('groupMember')(handler);