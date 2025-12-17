#!/usr/bin/env node

/**
 * Script to verify that key shares and verified proofs are being stored properly in the database
 */

import { db, pool, checkDatabaseConnection, closeDatabaseConnection } from '../lib/db/connection.js';
import { keyShares, verifiedProofs } from '../lib/db/schema.js';
import { sql } from 'drizzle-orm';

async function verifyStorage() {
  try {
    console.log('Checking database connection...');
    const connected = await checkDatabaseConnection();
    
    if (!connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(70));
    console.log('DATABASE STORAGE VERIFICATION');
    console.log('='.repeat(70));

    // ==========================================
    // 1. Check Key Shares Storage
    // ==========================================
    console.log('\n1. KEY SHARES STORAGE');
    console.log('-'.repeat(70));
    
    const keySharesCount = await db.execute(sql`SELECT COUNT(*) as count FROM key_shares`);
    const totalKeyShares = parseInt(keySharesCount.rows[0].count);
    console.log(`Total key shares in database: ${totalKeyShares}`);

    if (totalKeyShares > 0) {
      // Get detailed information about key shares
      const keySharesDetails = await db.execute(sql`
        SELECT 
          id,
          auth0_sub,
          share_type,
          share_index,
          CASE 
            WHEN encrypted_share IS NOT NULL AND encrypted_share != '' THEN 'YES'
            ELSE 'NO'
          END as has_encrypted_share,
          CASE 
            WHEN share_hash IS NOT NULL AND share_hash != '' THEN 'YES'
            ELSE 'NO'
          END as has_share_hash,
          CASE 
            WHEN cloud_backup_url IS NOT NULL AND cloud_backup_url != '' THEN 'YES'
            ELSE 'NO'
          END as has_cloud_backup,
          created_at,
          updated_at,
          last_used_at
        FROM key_shares
        ORDER BY created_at DESC
        LIMIT 10
      `);

      console.log('\nRecent key shares (last 10):');
      console.log('ID | Auth0 Sub (first 20) | Type | Index | Encrypted | Hash | Cloud | Created');
      console.log('-'.repeat(70));
      
      for (const row of keySharesDetails.rows) {
        const auth0SubPreview = row.auth0_sub ? row.auth0_sub.substring(0, 20) + '...' : 'N/A';
        const created = row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : 'N/A';
        console.log(
          `${row.id} | ${auth0SubPreview.padEnd(23)} | ${row.share_type.padEnd(4)} | ${row.share_index} | ${row.has_encrypted_share.padEnd(9)} | ${row.has_share_hash.padEnd(4)} | ${row.has_cloud_backup.padEnd(5)} | ${created}`
        );
      }

      // Check for potential issues
      const missingEncryption = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM key_shares 
        WHERE share_type = 'SERVER' 
        AND (encrypted_share IS NULL OR encrypted_share = '')
      `);
      const missingEncryptionCount = parseInt(missingEncryption.rows[0].count);
      
      if (missingEncryptionCount > 0) {
        console.warn(`\nWARNING: ${missingEncryptionCount} SERVER share(s) missing encrypted data!`);
      } else {
        console.log('\nAll SERVER shares have encrypted data');
      }

      const missingHash = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM key_shares 
        WHERE share_hash IS NULL OR share_hash = ''
      `);
      const missingHashCount = parseInt(missingHash.rows[0].count);
      
      if (missingHashCount > 0) {
        console.warn(`WARNING: ${missingHashCount} share(s) missing hash for integrity verification!`);
      } else {
        console.log('All shares have integrity hashes');
      }

    } else {
      console.log('\nNo key shares found in database.');
      console.log('   Key shares are created when users initialize their identity via /api/zk/identity/init');
    }

    // ==========================================
    // 2. Check Verified Proofs Storage
    // ==========================================
    console.log('\n\n2. VERIFIED PROOFS STORAGE');
    console.log('-'.repeat(70));
    
    const proofsCount = await db.execute(sql`SELECT COUNT(*) as count FROM verified_proofs`);
    const totalProofs = parseInt(proofsCount.rows[0].count);
    console.log(`Total verified proofs in database: ${totalProofs}`);

    if (totalProofs > 0) {
      // Get detailed information about verified proofs
      const proofsDetails = await db.execute(sql`
        SELECT 
          id,
          wallet_address,
          identity_commitment,
          nullifier_hash,
          external_nullifier,
          group_id,
          CASE 
            WHEN proof_data IS NOT NULL AND proof_data != '' THEN 'YES'
            ELSE 'NO'
          END as has_proof_data,
          CASE 
            WHEN merkle_tree_root IS NOT NULL AND merkle_tree_root != '' THEN 'YES'
            ELSE 'NO'
          END as has_merkle_root,
          verification_time_ms,
          verified_at
        FROM verified_proofs
        ORDER BY verified_at DESC
        LIMIT 10
      `);

      console.log('\nRecent verified proofs (last 10):');
      console.log('ID | Wallet (first 12) | Commitment (first 12) | Nullifier (first 12) | Group | Proof Data | Root | Verified At');
      console.log('-'.repeat(70));
      
      for (const row of proofsDetails.rows) {
        const wallet = row.wallet_address ? row.wallet_address.substring(0, 12) + '...' : 'N/A';
        const commitment = row.identity_commitment ? row.identity_commitment.substring(0, 12) + '...' : 'N/A';
        const nullifier = row.nullifier_hash ? row.nullifier_hash.substring(0, 12) + '...' : 'N/A';
        const verified = row.verified_at ? new Date(row.verified_at).toISOString().split('T')[0] : 'N/A';
        const time = row.verification_time_ms ? `${row.verification_time_ms}ms` : 'N/A';
        
        console.log(
          `${row.id} | ${wallet.padEnd(15)} | ${commitment.padEnd(20)} | ${nullifier.padEnd(20)} | ${String(row.group_id).padEnd(5)} | ${row.has_proof_data.padEnd(10)} | ${row.has_merkle_root.padEnd(4)} | ${verified}`
        );
      }

      // Check for potential issues
      const missingProofData = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM verified_proofs 
        WHERE proof_data IS NULL OR proof_data = ''
      `);
      const missingProofDataCount = parseInt(missingProofData.rows[0].count);
      
      if (missingProofDataCount > 0) {
        console.warn(`\nWARNING: ${missingProofDataCount} proof(s) missing proof data!`);
      } else {
        console.log('\nAll verified proofs have proof data stored');
      }

      const missingWallet = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM verified_proofs 
        WHERE wallet_address IS NULL OR wallet_address = ''
      `);
      const missingWalletCount = parseInt(missingWallet.rows[0].count);
      
      if (missingWalletCount > 0) {
        console.warn(`WARNING: ${missingWalletCount} proof(s) missing wallet address!`);
      } else {
        console.log('All verified proofs have wallet addresses');
      }

      // Statistics
      const uniqueWallets = await db.execute(sql`
        SELECT COUNT(DISTINCT wallet_address) as count FROM verified_proofs
      `);
      const uniqueWalletsCount = parseInt(uniqueWallets.rows[0].count);
      console.log(`\nStatistics:`);
      console.log(`Unique wallet addresses: ${uniqueWalletsCount}`);
      console.log(`Average proofs per wallet: ${(totalProofs / uniqueWalletsCount).toFixed(2)}`);

    } else {
      console.log('\nNo verified proofs found in database.');
      console.log('   Verified proofs are stored when proofs are verified via /api/zk/verify');
    }

    // ==========================================
    // 3. Summary
    // ==========================================
    console.log('\n\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Key Shares: ${totalKeyShares > 0 ? 'Stored' : 'None found'}`);
    console.log(`Verified Proofs: ${totalProofs > 0 ? 'Stored' : 'None found'}`);
    
    if (totalKeyShares === 0 && totalProofs === 0) {
      console.log('\n To generate test data:');
      console.log('   1. Login to the application');
      console.log('   2. Initialize identity: POST /api/zk/identity/init');
      console.log('   3. Generate and verify a proof: POST /api/zk/verify');
    }

    console.log('\n' + '='.repeat(70));
    
  } catch (error) {
    console.error('Error verifying storage:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

// Run the script
verifyStorage();

