import { getSession } from '@auth0/nextjs-auth0';
import { createIdentity } from '../../../../lib/semaphore/identity';

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
      
      // For demo: use email as seed (not secure for prod!)
      const identity = createIdentity(session.user.email);
      
      // Return both commitment and full identity data
      res.status(200).json({ 
        identityCommitment: identity.commitment.toString(),
        identityData: {
          trapdoor: identity.trapdoor.toString(),
          nullifier: identity.nullifier.toString(),
          commitment: identity.commitment.toString()
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Error generating identity', error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
} 