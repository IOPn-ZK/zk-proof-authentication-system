#!/usr/bin/env node

/**
 * Quick script to create key_shares table if it doesn't exist
 * Run this if the migration fails due to existing columns
 */

import { pool } from '../lib/db/connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createKeySharesTable() {
  const client = await pool.connect();
  
  try {
    console.log('Creating key_shares table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS "key_shares" (
        "id" serial PRIMARY KEY NOT NULL,
        "auth0_sub" varchar(255) NOT NULL,
        "user_id" integer,
        "share_type" varchar(20) NOT NULL,
        "share_index" integer NOT NULL,
        "encrypted_share" text NOT NULL,
        "cloud_backup_url" text,
        "cloud_backup_encrypted" boolean DEFAULT true,
        "share_hash" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "last_used_at" timestamp,
        "tenant_id" integer,
        CONSTRAINT "key_shares_auth0_sub_unique" UNIQUE("auth0_sub")
      );
    `);
    
    console.log('Creating indexes...');
    
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "key_shares_auth0_sub_idx" ON "key_shares" ("auth0_sub");
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS "key_shares_share_type_idx" ON "key_shares" ("share_type");
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS "key_shares_user_id_idx" ON "key_shares" ("user_id");
    `);
    
    console.log(' key_shares table created successfully!');
    
  } catch (error) {
    if (error.code === '42P07') {
      console.log('key_shares table already exists');
    } else {
      console.error('Error creating table:', error.message);
      throw error;
    }
  } finally {
    client.release();
  }
}

createKeySharesTable()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });

