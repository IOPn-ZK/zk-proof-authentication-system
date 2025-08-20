import { resetGroup } from '../../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    // Session already validated by security middleware
    const userEmail = req.session.user.email;
    const sessionId = req.session.id;
    
    console.log('Group reset requested by:', userEmail);
    console.log('Performing database group reset...');
    
    // Perform database group reset (removes all members and resets root)
    const result = await resetGroup(1, userEmail, sessionId); // Default to group 1
    
    if (result) {
      console.log('Database group reset successful');
      res.status(200).json({ 
        success: true,
        message: 'Group data reset successfully in database',
        resetBy: userEmail,
        timestamp: new Date().toISOString(),
        details: 'All group members have been removed and group root has been reset to default state'
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

export default withSecurityConfig('groupReset')(handler);