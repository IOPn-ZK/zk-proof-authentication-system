import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool, checkDatabaseConnection } from '../lib/db/connection.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Database migration script
 * Runs all pending migrations and optionally migrates data from JSON files
 */

async function runMigrations() {
  try {
    console.log('Starting database migration...');
    
    // Check database connection
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      throw new Error('Cannot connect to database');
    }
    
    // Run migrations
    console.log('Running database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Database migrations completed successfully');
    
    // Migrate existing JSON data if it exists
    await migrateJsonData();
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Migrate existing JSON data to PostgreSQL
 */
async function migrateJsonData() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const groupFile = path.join(dataDir, 'group.json');
    
    if (!fs.existsSync(groupFile)) {
      console.log('No existing JSON data found to migrate');
      return;
    }
    
    console.log('Migrating existing JSON data...');
    
    // Import the group service
    const { getOrCreateGroup, addMemberToGroup } = await import('../lib/db/groupService.js');
    
    // Read existing JSON data
    let jsonData;
    try {
      // Try to decrypt first (if encrypted)
      const { decryptFromFile } = await import('../lib/security/encryption.js');
      jsonData = decryptFromFile(groupFile);
      console.log('Decrypted existing group data');
    } catch (decryptError) {
      // Fall back to plain JSON
      try {
        jsonData = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
        console.log('Read plain JSON group data');
      } catch (jsonError) {
        console.log('Could not read existing group data, skipping migration');
        return;
      }
    }
    
    if (!jsonData || !Array.isArray(jsonData.members)) {
      console.log('Invalid group data format, skipping migration');
      return;
    }
    
    // Create group in database
    const groupId = jsonData.id || 1;
    const treeDepth = jsonData.treeDepth || 20;
    
    console.log(`Migrating group ${groupId} with ${jsonData.members.length} members...`);
    
    // Ensure group exists
    await getOrCreateGroup(groupId, treeDepth);
    
    // Add all members
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const commitment of jsonData.members) {
      if (commitment && commitment.trim()) {
        try {
          const added = await addMemberToGroup(groupId, commitment.trim(), 'migration', 'migration');
          if (added) {
            migratedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`Failed to migrate member ${commitment.substring(0, 18)}...:`, error.message);
          skippedCount++;
        }
      }
    }
    
    console.log(`Migration completed: ${migratedCount} members added, ${skippedCount} skipped`);
    
    // Backup the original file
    const backupFile = groupFile + '.backup.' + Date.now();
    fs.copyFileSync(groupFile, backupFile);
    console.log(`Original file backed up to: ${backupFile}`);
    
  } catch (error) {
    console.error('Error migrating JSON data:', error);
  }
}

// Run migrations
runMigrations();