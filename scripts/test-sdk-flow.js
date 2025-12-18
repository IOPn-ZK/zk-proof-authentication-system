#!/usr/bin/env node

/**
 * Comprehensive test script for Semaphore SDK and full flow verification
 * Tests:
 * 1. SDK functions (identity generation, proof generation)
 * 2. Full flow: identity init -> group membership -> proof generation -> verification -> storage
 * 3. Database storage verification
 */

import dotenv from 'dotenv';
dotenv.config();

// Import from published SDK package
import { 
  generateDeterministicIdentity, 
  retrieveIdentity,
  generateProofWithSetup,
  generateDeterministicWallet,
  Group
} from '@iopn-zk/zk-proof-authentication-sdk';

import { db, pool, checkDatabaseConnection, closeDatabaseConnection } from '../lib/db/connection.js';
import { keyShares, verifiedProofs, groupMembers, groups } from '../lib/db/schema.js';
import { getOrCreateGroup, addMemberToGroup, getFullGroupData } from '../lib/db/groupService.js';
import { storeServerShare, hasKeyShares, getServerShare } from '../lib/db/keyShareService.js';
import { storeVerifiedProof } from '../lib/db/proofStorageService.js';
import { verifyProof } from '@semaphore-protocol/proof';
import { splitPrivateKey, encryptShareForServer } from '../lib/security/keyShareService.js';
import { sql } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_AUTH0_SUB = 'test-user|123456789';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_GROUP_ID = 1;
const TEST_TREE_DEPTH = 20;
const TEST_SIGNAL = '0x1234567890abcdef';
const TEST_EXTERNAL_NULLIFIER = '0x9876543210fedcba';

let testResults = {
  sdkTests: [],
  flowTests: [],
  storageTests: [],
  errors: []
};

function logTest(category, testName, passed, message = '') {
  const result = { category, testName, passed, message, timestamp: new Date().toISOString() };
  if (category === 'sdk') {
    testResults.sdkTests.push(result);
  } else if (category === 'flow') {
    testResults.flowTests.push(result);
  } else if (category === 'storage') {
    testResults.storageTests.push(result);
  }
  
  const icon = passed ? '✓' : '✗';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${icon} [${category.toUpperCase()}] ${testName}: ${status} ${message ? '- ' + message : ''}`);
  
  if (!passed) {
    testResults.errors.push(`${testName}: ${message}`);
  }
}

async function testSDKFunctions() {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING SDK FUNCTIONS');
  console.log('='.repeat(70));
  
  const appSecret = process.env.AUTH0_SECRET;
  if (!appSecret) {
    logTest('sdk', 'Environment Setup', false, 'AUTH0_SECRET not configured');
    return null;
  }
  logTest('sdk', 'Environment Setup', true, 'AUTH0_SECRET found');

  // Test 1: Generate Deterministic Identity
  try {
    const identityResult = generateDeterministicIdentity(TEST_AUTH0_SUB, appSecret, TEST_USER_EMAIL);
    if (!identityResult.identity || !identityResult.commitment || !identityResult.privateKey) {
      logTest('sdk', 'Generate Deterministic Identity', false, 'Missing required fields');
      return null;
    }
    logTest('sdk', 'Generate Deterministic Identity', true, `Commitment: ${identityResult.commitment.substring(0, 16)}...`);
    return identityResult;
  } catch (error) {
    logTest('sdk', 'Generate Deterministic Identity', false, error.message);
    return null;
  }
}

async function testIdentityRetrieval(originalIdentity) {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING IDENTITY RETRIEVAL');
  console.log('='.repeat(70));
  
  const appSecret = process.env.AUTH0_SECRET;
  
  try {
    const retrievedIdentity = retrieveIdentity(TEST_AUTH0_SUB, appSecret, TEST_USER_EMAIL);
    
    if (retrievedIdentity.commitment !== originalIdentity.commitment) {
      logTest('sdk', 'Retrieve Identity', false, 'Commitment mismatch');
      return null;
    }
    
    logTest('sdk', 'Retrieve Identity', true, 'Identity retrieved correctly (deterministic)');
    return retrievedIdentity;
  } catch (error) {
    logTest('sdk', 'Retrieve Identity', false, error.message);
    return null;
  }
}

async function testKeySharesStorage(identityResult) {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING KEY SHARES STORAGE');
  console.log('='.repeat(70));
  
  try {
    // Check if shares already exist
    const sharesExist = await hasKeyShares(TEST_AUTH0_SUB);
    logTest('flow', 'Check Existing Shares', true, sharesExist ? 'Shares exist' : 'No shares found');
    
    if (!sharesExist) {
      // Split private key into shares
      const shares = splitPrivateKey(identityResult.privateKey, 3, 2);
      logTest('flow', 'Split Private Key', shares.length === 3, `Created ${shares.length} shares`);
      
      // Store server share
      const { encryptedShare, shareHash } = encryptShareForServer(shares[1]);
      await storeServerShare(TEST_AUTH0_SUB, encryptedShare, shareHash);
      logTest('flow', 'Store Server Share', true, 'Server share stored in database');
      
      // Verify storage
      const storedShare = await getServerShare(TEST_AUTH0_SUB);
      if (!storedShare || storedShare.shareType !== 'SERVER') {
        logTest('flow', 'Verify Server Share Storage', false, 'Share not found or wrong type');
      } else {
        logTest('flow', 'Verify Server Share Storage', true, 'Share verified in database');
      }
    } else {
      logTest('flow', 'Skip Share Creation', true, 'Shares already exist');
    }
    
    return true;
  } catch (error) {
    logTest('flow', 'Key Shares Storage', false, error.message);
    return false;
  }
}

async function testGroupMembership(identityResult) {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING GROUP MEMBERSHIP');
  console.log('='.repeat(70));
  
  try {
    // Get or create group
    const groupData = await getOrCreateGroup(TEST_GROUP_ID, TEST_TREE_DEPTH);
    logTest('flow', 'Get or Create Group', true, `Group ${TEST_GROUP_ID} with ${groupData.members.length} members`);
    
    // Add member to group
    const commitment = identityResult.commitment;
    const added = await addMemberToGroup(TEST_GROUP_ID, commitment, TEST_USER_EMAIL, null, TEST_AUTH0_SUB);
    
    if (added) {
      logTest('flow', 'Add Member to Group', true, 'Member added successfully');
    } else {
      logTest('flow', 'Add Member to Group', true, 'Member already exists (expected if rerunning)');
    }
    
    // Verify member is in group
    const updatedGroupData = await getFullGroupData(TEST_GROUP_ID);
    const isMember = updatedGroupData.members.includes(commitment);
    logTest('flow', 'Verify Group Membership', isMember, isMember ? 'Member found in group' : 'Member not found');
    
    return updatedGroupData;
  } catch (error) {
    logTest('flow', 'Group Membership', false, error.message);
    return null;
  }
}

async function testProofGeneration(identityResult, groupData) {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING PROOF GENERATION');
  console.log('='.repeat(70));
  
  try {
    // Verify identity is in group
    const commitment = identityResult.commitment;
    if (!groupData.members.includes(commitment)) {
      logTest('flow', 'Proof Generation - Identity Check', false, 'Identity not in group');
      return null;
    }
    logTest('flow', 'Proof Generation - Identity Check', true, 'Identity is in group');
    
    // Create Semaphore group
    const group = new Group(groupData.id, groupData.treeDepth, groupData.members.map(BigInt));
    logTest('flow', 'Create Semaphore Group', true, `Group with ${groupData.members.length} members`);
    
    // Get trusted setup paths
    const publicDir = path.join(process.cwd(), 'public', 'semaphore', groupData.treeDepth.toString());
    const wasmPath = path.join(publicDir, 'semaphore.wasm');
    const zkeyPath = path.join(publicDir, 'semaphore.zkey');
    
    const fs = await import('fs');
    if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
      logTest('flow', 'Proof Generation - Trusted Setup', false, `Files not found: ${wasmPath}, ${zkeyPath}`);
      return null;
    }
    logTest('flow', 'Proof Generation - Trusted Setup', true, 'WASM and zkey files found');
    
    // Generate proof
    const fullProof = await generateProofWithSetup(
      identityResult.identity,
      group,
      BigInt(TEST_SIGNAL),
      BigInt(TEST_EXTERNAL_NULLIFIER),
      {
        wasmPath,
        zkeyPath
      }
    );
    
    if (!fullProof || !fullProof.proof) {
      logTest('flow', 'Generate Proof', false, 'Proof generation failed');
      return null;
    }
    logTest('flow', 'Generate Proof', true, 'Proof generated successfully');
    
    return fullProof;
  } catch (error) {
    logTest('flow', 'Proof Generation', false, error.message);
    console.error('Proof generation error:', error);
    return null;
  }
}

async function testProofVerification(fullProof, groupData) {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING PROOF VERIFICATION');
  console.log('='.repeat(70));
  
  try {
    if (!fullProof) {
      logTest('flow', 'Proof Verification', false, 'No proof to verify');
      return false;
    }
    
    // Verify proof
    const isValid = await verifyProof(fullProof, groupData.treeDepth);
    logTest('flow', 'Verify Proof', isValid, isValid ? 'Proof is valid' : 'Proof is invalid');
    
    return isValid;
  } catch (error) {
    logTest('flow', 'Proof Verification', false, error.message);
    return false;
  }
}

async function testProofStorage(fullProof, identityResult, isValid) {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING PROOF STORAGE');
  console.log('='.repeat(70));
  
  try {
    if (!isValid || !fullProof) {
      logTest('storage', 'Store Verified Proof', false, 'Proof not valid or missing');
      return false;
    }
    
    const appSecret = process.env.AUTH0_SECRET;
    const walletResult = generateDeterministicWallet(TEST_AUTH0_SUB, appSecret);
    
    let nullifierHash = null;
    if (fullProof.nullifier !== undefined && fullProof.nullifier !== null) {
      nullifierHash = typeof fullProof.nullifier === 'bigint' 
        ? fullProof.nullifier.toString() 
        : String(fullProof.nullifier);
    } else if (fullProof.nullifierHash !== undefined && fullProof.nullifierHash !== null) {
      nullifierHash = typeof fullProof.nullifierHash === 'bigint' 
        ? fullProof.nullifierHash.toString() 
        : String(fullProof.nullifierHash);
    } else if (fullProof.scope !== undefined && fullProof.scope !== null) {
      // Semaphore v3+ might use 'scope' instead of 'nullifier'
      nullifierHash = typeof fullProof.scope === 'bigint' 
        ? fullProof.scope.toString() 
        : String(fullProof.scope);
    }
    
    if (!nullifierHash) {
      console.log('Proof structure keys:', Object.keys(fullProof));
      console.log('Proof structure (first 500 chars):', JSON.stringify(fullProof, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2).substring(0, 500));
      logTest('storage', 'Store Verified Proof', false, 'No nullifier found in proof (checked nullifier, nullifierHash, scope)');
      return false;
    }
    
    // Store verified proof
    const stored = await storeVerifiedProof(
      walletResult.walletAddress,
      identityResult.commitment,
      nullifierHash,
      TEST_EXTERNAL_NULLIFIER,
      TEST_SIGNAL,
      TEST_GROUP_ID,
      TEST_TREE_DEPTH,
      fullProof,
      null, // verificationTimeMs
      null, // req
      null  // tenantId
    );
    
    logTest('storage', 'Store Verified Proof', stored, stored ? 'Proof stored successfully' : 'Failed to store proof');
    
    // Verify storage in database
    const storedProofs = await db.execute(sql`
      SELECT * FROM verified_proofs 
      WHERE nullifier_hash = ${nullifierHash}
      LIMIT 1
    `);
    
    if (storedProofs.rows.length > 0) {
      const proof = storedProofs.rows[0];
      logTest('storage', 'Verify Proof in Database', true, `Proof found with ID ${proof.id}`);
      
      // Check all required fields
      const hasWallet = !!proof.wallet_address;
      const hasCommitment = !!proof.identity_commitment;
      const hasNullifier = !!proof.nullifier_hash;
      const hasProofData = !!proof.proof_data;
      const hasRoot = !!proof.merkle_tree_root;
      
      logTest('storage', 'Proof Data - Wallet Address', hasWallet, hasWallet ? 'Present' : 'Missing');
      logTest('storage', 'Proof Data - Identity Commitment', hasCommitment, hasCommitment ? 'Present' : 'Missing');
      logTest('storage', 'Proof Data - Nullifier Hash', hasNullifier, hasNullifier ? 'Present' : 'Missing');
      logTest('storage', 'Proof Data - Proof JSON', hasProofData, hasProofData ? 'Present' : 'Missing');
      logTest('storage', 'Proof Data - Merkle Root', hasRoot, hasRoot ? 'Present' : 'Missing');
      
      return true;
    } else {
      logTest('storage', 'Verify Proof in Database', false, 'Proof not found in database');
      return false;
    }
  } catch (error) {
    logTest('storage', 'Proof Storage', false, error.message);
    console.error('Proof storage error:', error);
    return false;
  }
}

async function testDatabaseStorage() {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING DATABASE STORAGE VERIFICATION');
  console.log('='.repeat(70));
  
  try {
    // Check key shares
    const keySharesCount = await db.execute(sql`SELECT COUNT(*) as count FROM key_shares WHERE auth0_sub = ${TEST_AUTH0_SUB}`);
    const sharesCount = parseInt(keySharesCount.rows[0].count);
    logTest('storage', 'Key Shares in Database', sharesCount > 0, `Found ${sharesCount} share(s)`);
    
    // Check group membership
    const identityResult = generateDeterministicIdentity(TEST_AUTH0_SUB, process.env.AUTH0_SECRET, TEST_USER_EMAIL);
    const memberCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM group_members 
      WHERE group_id = ${TEST_GROUP_ID} AND commitment = ${identityResult.commitment}
    `);
    const isMember = parseInt(memberCount.rows[0].count) > 0;
    logTest('storage', 'Group Membership in Database', isMember, isMember ? 'Member found' : 'Member not found');
    
    // Check verified proofs
    const proofsCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM verified_proofs 
      WHERE identity_commitment = ${identityResult.commitment}
    `);
    const proofsFound = parseInt(proofsCount.rows[0].count);
    logTest('storage', 'Verified Proofs in Database', proofsFound > 0, `Found ${proofsFound} proof(s)`);
    
    return true;
  } catch (error) {
    logTest('storage', 'Database Storage Verification', false, error.message);
    return false;
  }
}

async function runFullFlowTest() {
  console.log('\n' + '='.repeat(70));
  console.log('SEMAPHORE SDK FULL FLOW TEST');
  console.log('='.repeat(70));
  console.log(`Test User: ${TEST_AUTH0_SUB}`);
  console.log(`Test Email: ${TEST_USER_EMAIL}`);
  console.log(`Test Group ID: ${TEST_GROUP_ID}`);
  console.log('='.repeat(70));
  
  try {
    // Check database connection
    console.log('\nChecking database connection...');
    const connected = await checkDatabaseConnection();
    if (!connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }
    console.log('Database connection successful\n');
    
    // Step 1: Test SDK Functions
    const identityResult = await testSDKFunctions();
    if (!identityResult) {
      console.error('\nSDK identity generation failed. Cannot continue.');
      await closeDatabaseConnection();
      process.exit(1);
    }
    
    // Step 2: Test Identity Retrieval
    const retrievedIdentity = await testIdentityRetrieval(identityResult);
    if (!retrievedIdentity) {
      console.error('\nIdentity retrieval failed. Cannot continue.');
      await closeDatabaseConnection();
      process.exit(1);
    }
    
    // Step 3: Test Key Shares Storage
    await testKeySharesStorage(identityResult);
    
    // Step 4: Test Group Membership
    const groupData = await testGroupMembership(identityResult);
    if (!groupData) {
      console.error('\nGroup membership failed. Cannot continue.');
      await closeDatabaseConnection();
      process.exit(1);
    }
    
    // Step 5: Test Proof Generation
    const fullProof = await testProofGeneration(identityResult, groupData);
    if (!fullProof) {
      console.error('\nProof generation failed. Cannot continue.');
      await closeDatabaseConnection();
      process.exit(1);
    }
    
    // Step 6: Test Proof Verification
    const isValid = await testProofVerification(fullProof, groupData);
    if (!isValid) {
      console.error('\nProof verification failed. Cannot continue.');
      await closeDatabaseConnection();
      process.exit(1);
    }
    
    // Step 7: Test Proof Storage
    await testProofStorage(fullProof, identityResult, isValid);
    
    // Step 8: Final Database Verification
    await testDatabaseStorage();
    
    // Print Summary
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    
    const allSDKTests = testResults.sdkTests;
    const allFlowTests = testResults.flowTests;
    const allStorageTests = testResults.storageTests;
    
    const sdkPassed = allSDKTests.filter(t => t.passed).length;
    const flowPassed = allFlowTests.filter(t => t.passed).length;
    const storagePassed = allStorageTests.filter(t => t.passed).length;
    
    console.log(`\nSDK Tests: ${sdkPassed}/${allSDKTests.length} passed`);
    console.log(`Flow Tests: ${flowPassed}/${allFlowTests.length} passed`);
    console.log(`Storage Tests: ${storagePassed}/${allStorageTests.length} passed`);
    
    const totalPassed = sdkPassed + flowPassed + storagePassed;
    const totalTests = allSDKTests.length + allFlowTests.length + allStorageTests.length;
    
    console.log(`\nTotal: ${totalPassed}/${totalTests} tests passed`);
    
    if (testResults.errors.length > 0) {
      console.log('\nErrors:');
      testResults.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (totalPassed === totalTests) {
      console.log('\n✓ All tests passed! SDK and full flow are working correctly.');
      console.log('✓ Data is being stored properly in the database.');
    } else {
      console.log('\n✗ Some tests failed. Please review the errors above.');
    }
    
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\nFatal error during testing:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

// Run the test
runFullFlowTest();

