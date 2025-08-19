import { Group } from '@semaphore-protocol/group';
import { getGroupData } from '../../../../lib/semaphore/group.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    console.log('Fetching encrypted group data...');
    
    // Session already validated by security middleware
    const userEmail = req.session.user.email;
    console.log('Group data requested by:', userEmail);
    
    // Get group data from encrypted storage
    const groupData = await getGroupData();
    console.log('Retrieved group data with member count:', groupData.members.length);
    
    // Create Group instance for root calculation
    const group = new Group(groupData.id, groupData.treeDepth, groupData.members.map(BigInt));
    console.log('Created Group instance with root:', group.root.toString());
    
    const response = {
      success: true,
      id: groupData.id,
      treeDepth: groupData.treeDepth,
      members: groupData.members,
      memberCount: groupData.members.length,
      root: group.root.toString(),
      timestamp: new Date().toISOString(),
      requestedBy: userEmail
    };
    
    console.log('Sending secure group response');
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Error in secure group/full:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching group data', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

export default withSecurityConfig('groupData')(handler);