import { resetGroup } from '../../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    console.log('POST /api/zk/group/reset-pg - Starting PostgreSQL-based request processing');
    
    // Session validation already handled by security middleware
    const userEmail = req.session.user.email;
    console.log('User authenticated:', userEmail);
    
    // Reset group using PostgreSQL
    const result = await resetGroup(1, userEmail, req.session.id);
    console.log('resetGroup result:', result);
    
    if (result) {
      console.log('Group reset successfully');
      res.status(200).json({
        success: true,
        message: 'Group reset successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Failed to reset group');
    }
    
  } catch (error) {
    console.error('Error in /api/zk/group/reset-pg:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error resetting group',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

export default withSecurityConfig('groupReset')(handler);