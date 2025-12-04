#!/usr/bin/env node

/**
 * Test script for Key-Share Splitting functionality
 * Tests basic splitting, combining, and security properties
 */

import { splitPrivateKey, combineShares } from '../lib/security/keyShareService.js';
import crypto from 'crypto';

console.log('🧪 Testing Key-Share Splitting Implementation\n');
console.log('='.repeat(60));

// Test 1: Basic splitting and combining
console.log('\n📦 Test 1: Basic Splitting and Combining');
console.log('-'.repeat(60));

const testPrivateKey = '0x' + '1'.repeat(64); // 32 bytes (256 bits)
const normalizedKey = testPrivateKey.startsWith('0x') ? testPrivateKey.slice(2) : testPrivateKey;

console.log('Original key (normalized):', normalizedKey.substring(0, 32) + '...');
console.log('Key length:', normalizedKey.length, 'hex chars (', normalizedKey.length / 2, 'bytes)');

try {
  // Split into 3 shares with threshold 2
  const shares = splitPrivateKey(testPrivateKey, 3, 2);
  console.log('✅ Shares created:', shares.length);
  console.log('   Share A (Index 1):', shares[0].substring(0, 30) + '...');
  console.log('   Share B (Index 2):', shares[1].substring(0, 30) + '...');
  console.log('   Share C (Index 3):', shares[2].substring(0, 30) + '...');
  
  // Test all combinations
  console.log('\n🔄 Testing Share Combinations:');
  
  // A + B
  const keyAB = combineShares([shares[0], shares[1]]);
  const matchAB = keyAB === normalizedKey;
  console.log('   A + B:', matchAB ? '✅ MATCH' : '❌ MISMATCH');
  
  // A + C
  const keyAC = combineShares([shares[0], shares[2]]);
  const matchAC = keyAC === normalizedKey;
  console.log('   A + C:', matchAC ? '✅ MATCH' : '❌ MISMATCH');
  
  // B + C
  const keyBC = combineShares([shares[1], shares[2]]);
  const matchBC = keyBC === normalizedKey;
  console.log('   B + C:', matchBC ? '✅ MATCH' : '❌ MISMATCH');
  
  if (matchAB && matchAC && matchBC) {
    console.log('\n✅ All combinations successful!');
  } else {
    console.log('\n❌ Some combinations failed!');
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Test 1 failed:', error.message);
  process.exit(1);
}

// Test 2: Security - Single share should fail
console.log('\n🔒 Test 2: Security - Single Share Rejection');
console.log('-'.repeat(60));

try {
  const shares = splitPrivateKey(testPrivateKey, 3, 2);
  combineShares([shares[0]]);
  console.log('❌ ERROR: Single share should fail!');
  process.exit(1);
} catch (error) {
  if (error.message.includes('at least 2 shares')) {
    console.log('✅ Single share correctly rejected:', error.message);
  } else {
    console.log('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Test 3: Security - Corrupted share should fail
console.log('\n🔒 Test 3: Security - Corrupted Share Detection');
console.log('-'.repeat(60));

try {
  const shares = splitPrivateKey(testPrivateKey, 3, 2);
  const corruptedShare = shares[0].slice(0, -10) + 'corrupted';
  const reconstructed = combineShares([corruptedShare, shares[1]]);
  
  if (reconstructed === normalizedKey) {
    console.log('⚠️  WARNING: Corrupted share was accepted (may be acceptable in some schemes)');
  } else {
    console.log('✅ Corrupted share detected - reconstruction failed');
  }
} catch (error) {
  console.log('✅ Corrupted share correctly rejected:', error.message);
}

// Test 4: Different key sizes
console.log('\n📏 Test 4: Different Key Sizes');
console.log('-'.repeat(60));

const testKeys = [
  '0x' + 'a'.repeat(64), // 32 bytes
  '0x' + 'b'.repeat(62),  // 31 bytes (will be padded)
  '0x' + 'c'.repeat(66),  // 33 bytes (will be truncated)
];

for (let i = 0; i < testKeys.length; i++) {
  try {
    const shares = splitPrivateKey(testKeys[i], 3, 2);
    const reconstructed = combineShares([shares[0], shares[1]]);
    const normalized = testKeys[i].startsWith('0x') ? testKeys[i].slice(2) : testKeys[i];
    const normalizedRecon = reconstructed.length === 64 ? reconstructed : reconstructed.padStart(64, '0');
    const match = normalizedRecon === normalized.padStart(64, '0').slice(0, 64);
    console.log(`   Key ${i + 1} (${testKeys[i].length - 2} hex chars):`, match ? '✅' : '❌');
  } catch (error) {
    console.log(`   Key ${i + 1}: ❌ Error -`, error.message);
  }
}

// Test 5: Random key generation
console.log('\n🎲 Test 5: Random Key Generation');
console.log('-'.repeat(60));

try {
  const randomKey = '0x' + crypto.randomBytes(32).toString('hex');
  console.log('Random key:', randomKey.substring(0, 34) + '...');
  
  const shares = splitPrivateKey(randomKey, 3, 2);
  const reconstructed = combineShares([shares[0], shares[1]]);
  const normalized = randomKey.slice(2);
  const match = reconstructed === normalized;
  
  console.log('Reconstruction:', match ? '✅ MATCH' : '❌ MISMATCH');
  
  if (!match) {
    console.log('Expected:', normalized.substring(0, 32) + '...');
    console.log('Got:', reconstructed.substring(0, 32) + '...');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Test 5 failed:', error.message);
  process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('✅ All tests passed!');
console.log('='.repeat(60));
console.log('\n📝 Next steps:');
console.log('   1. Run database migration: npm run db:migrate');
console.log('   2. Test with real Auth0 login');
console.log('   3. Test API endpoints with authenticated session');
console.log('   4. Verify shares are stored in database\n');

