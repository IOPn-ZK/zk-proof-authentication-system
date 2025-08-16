import { completeGroupReset } from '../../../../lib/semaphore/group.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    // Session already validated by security middleware
    const userEmail = req.session.user.email;
    
    console.log('Group reset requested by:', userEmail);
    console.log('Performing complete group reset...');
    
    // Perform complete group reset (removes all files and cache)
    const result = await completeGroupReset();
    
    if (result) {
      console.log('Complete group reset successful');
      res.status(200).json({ 
        success: true,
        message: 'Group data completely reset successfully',
        resetBy: userEmail,
        timestamp: new Date().toISOString(),
        details: 'All group files, cache, and encrypted data have been cleared and reset to default state'
      });
    } else {
      throw new Error('Group reset operation failed');
    }
    
  } catch (error) {
    console.error('Error resetting group data:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      message: 'Error resetting group data', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      details: 'The group reset operation encountered an error. Please try again or contact support.'
    });
  }
}

// Apply security middleware with group reset configuration (requires auth)
export default withSecurityConfig('groupReset')(handler);