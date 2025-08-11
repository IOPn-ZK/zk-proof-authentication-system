import { getSession } from '@auth0/nextjs-auth0';
import { generateProof } from '@semaphore-protocol/proof';
import { Group } from '@semaphore-protocol/group';
import { Identity } from '@semaphore-protocol/identity';
import { getGroupData } from '../../../lib/semaphore/group';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const session = await getSession(req, res);
      if (!session || !session.user || !session.user.email) {
        return res.status(401).json({ message: 'Unauthorized: Please log in' });
      }

      const { signal } = req.body;
      if (!signal) {
        return res.status(400).json({ message: 'Signal is required' });
      }

      // Get group data
      const groupData = await getGroupData();
      if (!groupData || !groupData.members || groupData.members.length === 0) {
        return res.status(400).json({ message: 'No group members found' });
      }

      // Create identity from user email
      const identity = new Identity(session.user.email);
      
      // Create group
      const group = new Group(groupData.id, groupData.treeDepth || 20, groupData.members.map(BigInt));
      
      // Generate proof
      const externalNullifier = BigInt(Math.floor(Math.random() * 1000000));
      const fullProof = await generateProof(identity, group, BigInt(signal), externalNullifier);

      res.status(200).json({ 
        fullProof,
        externalNullifier: externalNullifier.toString()
      });
    } catch (error) {
      res.status(500).json({ message: 'Error generating proof', error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
