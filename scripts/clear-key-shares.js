#!/usr/bin/env node

/**
 * Script to clear all key shares data from the database
 * WARNING: This will permanently delete all key shares data
 */

import { db, pool, checkDatabaseConnection, closeDatabaseConnection } from '../lib/db/connection.js';
import { keyShares } from '../lib/db/schema.js';
import { sql } from 'drizzle-orm';

async function clearKeyShares() {
  try {
    console.log('Checking database connection...');
    const connected = await checkDatabaseConnection();
    
    if (!connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }

    console.log('Counting existing key shares...');
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM key_shares`);
    const count = parseInt(countResult.rows[0].count);
    console.log(`   Found ${count} key share record(s)`);

    if (count === 0) {
      console.log('No key shares to delete. Database is already empty.');
      await closeDatabaseConnection();
      process.exit(0);
    }

    console.log('\n Deleting all key shares data...');
    // Delete all records from key_shares table
    await db.execute(sql`DELETE FROM key_shares`);
    console.log(`Successfully deleted all key shares data`);

    // Verify deletion
    const verifyResult = await db.execute(sql`SELECT COUNT(*) as count FROM key_shares`);
    const remainingCount = parseInt(verifyResult.rows[0].count);
    
    if (remainingCount === 0) {
      console.log('Verification: All key shares have been removed');
    } else {
      console.warn(`Warning: ${remainingCount} record(s) still remain`);
    }

    console.log('\nKey shares table is now empty and ready for fresh data');
    
  } catch (error) {
    console.error('Error clearing key shares:', error);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

// Run the script
clearKeyShares();

