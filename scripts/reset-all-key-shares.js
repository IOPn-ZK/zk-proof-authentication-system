#!/usr/bin/env node
/**
 * Reset All Key Shares Script
 * Deletes all key shares from all accounts for demo purposes
 * 
 * Usage: node scripts/reset-all-key-shares.js
 */

import { pool } from '../lib/db/connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function resetAllKeyShares() {
  try {
    console.log('🔄 Resetting all key shares...');
    
    // Delete all key shares
    const result = await pool.query('DELETE FROM key_shares');
    
    console.log(`✅ Deleted ${result.rowCount || 0} key share records from all accounts`);
    console.log('📝 All users will need to re-initialize their identity to create new shares');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting key shares:', error);
    process.exit(1);
  }
}

resetAllKeyShares();

