import { addMemberToGroup } from '../../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { getTenantId } from '../../../../lib/security/tenant.js';

async function handler(req, res) {
  try {
    console.log('POST /api/zk/group/members - Starting secure request processing');
    
    // Session and validation already handled by security middleware
    const userEmail = req.session.user.email;
    const userSub = req.session.user.sub;
    const sessionId = req.session.id;
    const tenantId = getTenantId(req);
    const { commitment } = req.body; // Already validated and sanitized
    
    console.log('User authenticated:', userEmail);
    console.log('Adding member with commitment:', commitment);
    
    // Add member to group in database
    const result = await addMemberToGroup(1, commitment, userEmail, sessionId, userSub, tenantId); // Default to group 1
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
    console.error('Error in /api/zk/group/members:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Error adding member to group', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

export default withSecurityConfig('groupMember')(handler);