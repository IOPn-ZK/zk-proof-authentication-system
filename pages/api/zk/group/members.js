import { getSession } from '@auth0/nextjs-auth0';
import { addMember } from '../../../../lib/semaphore/group';

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
      console.log('POST /api/zk/group/members - Starting request processing');
      
      const session = await getSession(req, res);
      console.log('Session retrieved:', session ? 'Yes' : 'No');
      
      if (!session || !session.user || !session.user.email) {
        console.log('Unauthorized access attempt');
        return res.status(401).json({ 
          success: false,
          message: 'Unauthorized: Please log in',
          error: 'No valid session found'
        });
      }

      console.log('User authenticated:', session.user.email);

      const { commitment } = req.body;
      console.log('Request body:', req.body);
      console.log('Commitment from body:', commitment);
      
      if (!commitment) {
        console.log('Missing commitment in request body');
        return res.status(400).json({ 
          success: false,
          message: 'Commitment is required',
          error: 'No commitment provided in request body'
        });
      }

      console.log('Adding member with commitment:', commitment);
      
      // Fix: await the addMember function
      const result = await addMember(commitment);
      console.log('addMember result:', result);
      
      if (result) {
        console.log('Member added successfully');
        res.status(200).json({ 
          success: true,
          message: 'Member added to group successfully',
          commitment: commitment
        });
      } else {
        console.log('Member already exists in group');
        res.status(200).json({ 
          success: true,
          message: 'Member already exists in group',
          commitment: commitment
        });
      }
    } catch (error) {
      console.error('Error in /api/zk/group/members:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code
      });
      
      res.status(500).json({ 
        success: false,
        message: 'Error adding member', 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } else {
    res.status(405).json({ 
      success: false,
      message: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }
}