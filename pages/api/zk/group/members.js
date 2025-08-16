import { addMember } from '../../../../lib/semaphore/group.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    console.log('POST /api/zk/group/members - Starting secure request processing');
    
    // Session and validation already handled by security middleware
    const userEmail = req.session.user.email;
    const { commitment } = req.body; // Already validated and sanitized
    
    console.log('User authenticated:', userEmail);
    console.log('Adding member with commitment:', commitment);
    
    // Add member to group with encrypted storage
    const result = await addMember(commitment);
    console.log('addMember result:', result);
    
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

// Apply security middleware with group member configuration
export default withSecurityConfig('groupMember')(handler);