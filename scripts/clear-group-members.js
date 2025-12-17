#!/usr/bin/env node
/**
 * Clear All Group Members Script
 * Removes all members from the Semaphore group for demo purposes
 * 
 * Usage: node scripts/clear-group-members.js [groupId]
 */

import { pool } from '../lib/db/connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function clearGroupMembers(groupId = 1) {
  try {
    console.log(`🔄 Clearing all members from group ${groupId}...`);
    
    // Delete all group members
    const result = await pool.query(
      'DELETE FROM group_members WHERE group_id = $1',
      [groupId]
    );
    
    // Reset group root to empty
    const { Group } = await import('@semaphore-protocol/group');
    const emptyGroup = new Group(groupId, 20, []);
    const newRoot = emptyGroup.root.toString();
    
    await pool.query(
      'UPDATE groups SET root = $1, updated_at = NOW() WHERE group_id = $2',
      [newRoot, groupId]
    );
    
    console.log(`✅ Removed ${result.rowCount || 0} members from group ${groupId}`);
    console.log(`📝 Group root reset to empty state`);
    console.log('💡 Users can now join the group fresh');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing group members:', error);
    process.exit(1);
  }
}

const groupId = process.argv[2] ? parseInt(process.argv[2]) : 1;
clearGroupMembers(groupId);

