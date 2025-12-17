import { db, pool, checkDatabaseConnection } from '../lib/db/connection.js';
import { verifiedProofs, proofLogs, nullifiers, walletBindings } from '../lib/db/schema.js';
import { sql, desc } from 'drizzle-orm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkAllProofs() {
  try {
    console.log('\n🔍 Checking all verified proofs in database...\n');
    
    // Check database connection
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      throw new Error('Cannot connect to database');
    }
    
    // Get count of all proofs
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM verified_proofs`);
    const totalCount = countResult.rows[0]?.count || 0;
    
    console.log(`Total verified proofs in database: ${totalCount}\n`);
    
    if (totalCount > 0) {
      await printVerifiedProofs();
    } else {
      console.log('No verified proofs found in the database yet.');
      console.log('Proofs will be stored automatically when you verify a ZK proof through the application.\n');
    }

    await printProofLogs();
    await printNullifiers();
    await printWalletBindings();
    
    console.log(' Query completed!\n');
    
  } catch (error) {
    console.error('❌ Error querying database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function printVerifiedProofs() {
  // Get all unique wallet addresses with counts
  const walletAddressesResult = await db.execute(
    sql`SELECT wallet_address, COUNT(*) as proof_count 
        FROM verified_proofs 
        GROUP BY wallet_address 
        ORDER BY proof_count DESC, wallet_address ASC`
  );
  
  console.log('=== VERIFIED PROOFS ===');
  console.log(`Wallets with stored proofs: ${walletAddressesResult.rows.length}\n`);
  
  walletAddressesResult.rows.forEach((row, index) => {
    console.log(`${index + 1}. ${row.wallet_address} — ${row.proof_count} proof(s)`);
  });
  
  if (walletAddressesResult.rows.length === 0) {
    console.log('No wallet has stored proofs yet.\n');
  } else {
    console.log('');
  }
  
  // Recent proofs
  const recentProofs = await db
    .select()
    .from(verifiedProofs)
    .orderBy(desc(verifiedProofs.verifiedAt))
    .limit(10);
  
  console.log('=== RECENT PROOFS (Last 10) ===');
  if (recentProofs.length === 0) {
    console.log('No proof records found.\n');
    return;
  }
  
  recentProofs.forEach((proof, index) => {
    console.log(`\nProof #${index + 1}:`);
    console.log(`  Wallet: ${proof.walletAddress}`);
    console.log(`  Identity Commitment: ${proof.identityCommitment.substring(0, 20)}...`);
    console.log(`  Nullifier Hash: ${proof.nullifierHash.substring(0, 20)}...`);
    console.log(`  External Nullifier: ${proof.externalNullifier}`);
    console.log(`  Signal: ${proof.signal || 'N/A'}`);
    console.log(`  Group ID: ${proof.groupId}`);
    console.log(`  Tree Depth: ${proof.treeDepth}`);
    console.log(`  Verification Time: ${proof.verificationTimeMs ?? 'N/A'} ms`);
    console.log(`  Verified At: ${proof.verifiedAt}`);
    console.log(`  Proof Data Length: ${proof.proofData?.length ?? 0} characters`);
  });
  console.log('');
}

async function printProofLogs() {
  const proofLogsCount = await db.execute(sql`SELECT COUNT(*) as count FROM proof_logs`);
  const totalLogs = proofLogsCount.rows[0]?.count || 0;
  
  console.log('=== PROOF LOGS ===');
  console.log(`Total log entries: ${totalLogs}`);
  
  if (totalLogs === 0) {
    console.log('No proof verification logs recorded yet.\n');
    return;
  }
  
  const statusBreakdown = await db.execute(
    sql`SELECT proof_status, COUNT(*) as count 
        FROM proof_logs 
        GROUP BY proof_status 
        ORDER BY count DESC`
  );
  
  statusBreakdown.rows.forEach((row) => {
    console.log(`  ${row.proof_status}: ${row.count}`);
  });
  console.log('');
  
  const recentLogs = await db
    .select()
    .from(proofLogs)
    .orderBy(desc(proofLogs.createdAt))
    .limit(10);
  
  console.log('Recent log entries (up to 10):');
  recentLogs.forEach((log, index) => {
    console.log(`\nLog #${index + 1}:`);
    console.log(`  Status: ${log.proofStatus}`);
    console.log(`  Identity Commitment: ${log.identityCommitment.substring(0, 20)}...`);
    console.log(`  Nullifier Hash: ${log.nullifierHash ? log.nullifierHash.substring(0, 20) + '...' : 'N/A'}`);
    console.log(`  External Nullifier: ${log.externalNullifier || 'N/A'}`);
    console.log(`  Group ID: ${log.groupId ?? 'N/A'}`);
    console.log(`  Verification Time: ${log.verificationTimeMs ?? 'N/A'} ms`);
    console.log(`  Error: ${log.errorMessage || 'None'}`);
    console.log(`  IP Address: ${log.ipAddress || 'N/A'}`);
    console.log(`  User Agent: ${log.userAgent ? log.userAgent.substring(0, 60) + (log.userAgent.length > 60 ? '...' : '') : 'N/A'}`);
    console.log(`  Created At: ${log.createdAt}`);
  });
  console.log('');
}

async function printNullifiers() {
  const nullifiersCount = await db.execute(sql`SELECT COUNT(*) as count FROM nullifiers`);
  const totalNullifiers = nullifiersCount.rows[0]?.count || 0;
  
  console.log('=== NULLIFIERS ===');
  console.log(`Total nullifiers marked as used: ${totalNullifiers}`);
  
  if (totalNullifiers === 0) {
    console.log('No nullifiers have been stored yet.\n');
    return;
  }
  
  const recentNullifiers = await db
    .select()
    .from(nullifiers)
    .orderBy(desc(nullifiers.usedAt))
    .limit(10);
  
  console.log('Recent nullifiers (up to 10):');
  recentNullifiers.forEach((nullifier, index) => {
    console.log(`\nNullifier #${index + 1}:`);
    console.log(`  Nullifier Hash: ${nullifier.nullifierHash.substring(0, 20)}...`);
    console.log(`  Identity Commitment: ${nullifier.identityCommitment.substring(0, 20)}...`);
    console.log(`  External Nullifier: ${nullifier.externalNullifier}`);
    console.log(`  Signal: ${nullifier.signal || 'N/A'}`);
    console.log(`  Group ID: ${nullifier.groupId}`);
    console.log(`  Used At: ${nullifier.usedAt}`);
  });
  console.log('');
}

async function printWalletBindings() {
  const walletBindingsCount = await db.execute(sql`SELECT COUNT(*) as count FROM wallet_bindings`);
  const totalBindings = walletBindingsCount.rows[0]?.count || 0;
  
  console.log('=== WALLET BINDINGS ===');
  console.log(`Total wallet bindings: ${totalBindings}`);
  
  if (totalBindings === 0) {
    console.log('No wallet bindings stored.\n');
    return;
  }
  
  const recentBindings = await db
    .select()
    .from(walletBindings)
    .orderBy(desc(walletBindings.createdAt))
    .limit(10);
  
  recentBindings.forEach((binding, index) => {
    console.log(`\nBinding #${index + 1}:`);
    console.log(`  Wallet Address: ${binding.walletAddress}`);
    console.log(`  Identity Commitment: ${binding.identityCommitment.substring(0, 20)}...`);
    console.log(`  Wallet Type: ${binding.walletType}`);
    console.log(`  Chain ID: ${binding.chainId}`);
    console.log(`  Active: ${binding.isActive}`);
    console.log(`  Created At: ${binding.createdAt}`);
    console.log(`  Expires At: ${binding.expiresAt || 'N/A'}`);
  });
  console.log('');
}

// Run the query
checkAllProofs();

