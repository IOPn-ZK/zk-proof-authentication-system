import { getFullGroupData } from '../../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    console.log('GET /api/zk/group/full-pg - Starting PostgreSQL-based request processing');
    
    // Session validation already handled by security middleware
    const userEmail = req.session.user.email;
    console.log('User authenticated:', userEmail);
    
    // Get full group data from PostgreSQL
    const groupData = await getFullGroupData(1);
    console.log('Group data retrieved:', {
      id: groupData.id,
      memberCount: groupData.members.length,
      treeDepth: groupData.treeDepth,
    });
    
    res.status(200).json({
      success: true,
      ...groupData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in /api/zk/group/full-pg:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching group data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

export default withSecurityConfig('groupData')(handler);