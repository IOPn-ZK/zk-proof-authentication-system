import { addMemberToGroup } from '../../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { getTenantId } from '../../../../lib/security/tenant.js';

async function handler(req, res) {
  try {
    console.log('POST /api/zk/group/members-pg - Starting PostgreSQL-based request processing');
    
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'No valid session found',
        error: 'SESSION_MISSING'
      });
    }
    
    const userEmail = req.session.user.email;
    const userSub = req.session.user.sub;
    const tenantId = getTenantId(req);
    const { commitment } = req.body; 
    
    if (!commitment) {
      return res.status(400).json({
        success: false,
        message: 'Commitment is required',
        error: 'MISSING_COMMITMENT'
      });
    }
    
    console.log('User authenticated:', userEmail);
    console.log('Adding member with commitment:', commitment);
    
    try {
      const result = await addMemberToGroup(1, commitment, userEmail, req.session.id, userSub, tenantId);
      console.log('addMemberToGroup result:', result);
      
      if (result) {
        console.log('Member added successfully');
        return res.status(200).json({ 
          success: true,
          message: 'Member added to group successfully',
          commitment: commitment,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('Member already exists in group');
        return res.status(200).json({ 
          success: true,
          message: 'Member already exists in group',
          commitment: commitment,
          timestamp: new Date().toISOString()
        });
      }
    } catch (dbError) {
      console.error('Database error in addMemberToGroup:', dbError);
      
      // Check if it's a database connection error
      if (dbError.message && (dbError.message.includes('not available') || dbError.message.includes('ENOTFOUND') || dbError.message.includes('ECONNREFUSED'))) {
        return res.status(503).json({
          success: false,
          message: 'Database is not available. Please ensure database is configured.',
          error: 'DATABASE_UNAVAILABLE',
          timestamp: new Date().toISOString(),
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
      
      // Re-throw other errors to be caught by outer catch
      throw dbError;
    }
    
  } catch (error) {
    console.error('Error in /api/zk/group/members-pg:', error);
    console.error('Error stack:', error.stack);
    
    // Don't send response if headers already sent
    if (res.headersSent) {
      console.warn('Cannot send error response, headers already sent');
      return;
    }
    
    return res.status(500).json({ 
      success: false,
      message: 'Error adding member to group', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

export default withSecurityConfig('groupMember')(handler);