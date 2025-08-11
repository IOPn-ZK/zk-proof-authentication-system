import { Group } from '@semaphore-protocol/group';
import { getGroupData } from '../../../../lib/semaphore/group';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      console.log('Fetching group data...');
      const groupData = await getGroupData();
      console.log('Retrieved group data:', groupData);
      
      const group = new Group(groupData.id, groupData.treeDepth, groupData.members.map(BigInt));
      console.log('Created Group instance with root:', group.root.toString());
      
      const response = {
        success: true,
        id: groupData.id,
        treeDepth: groupData.treeDepth,
        members: groupData.members,
        memberCount: groupData.members.length,
        root: group.root.toString(),
      };
      
      console.log('Sending response:', response);
      res.status(200).json(response);
    } catch (error) {
      console.error('Error in group/full:', error);
      res.status(500).json({ success: false, message: 'Error fetching group data', error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}