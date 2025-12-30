#!/usr/bin/env node

/**
 * Copy WASM files to a location accessible in Vercel serverless functions
 * This script runs during build to ensure files are available
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const semaphoreDir = join(rootDir, 'public', 'semaphore', '20');
const targetDir = join(rootDir, '.next', 'server', 'public', 'semaphore', '20');

if (existsSync(semaphoreDir)) {
  mkdirSync(targetDir, { recursive: true });
  
  const wasmSource = join(semaphoreDir, 'semaphore.wasm');
  const zkeySource = join(semaphoreDir, 'semaphore.zkey');
  const wasmTarget = join(targetDir, 'semaphore.wasm');
  const zkeyTarget = join(targetDir, 'semaphore.zkey');
  
  if (existsSync(wasmSource)) {
    copyFileSync(wasmSource, wasmTarget);
    console.log('✓ Copied semaphore.wasm for serverless');
  }
  
  if (existsSync(zkeySource)) {
    copyFileSync(zkeySource, zkeyTarget);
    console.log('✓ Copied semaphore.zkey for serverless');
  }
} else {
  console.warn('⚠ Semaphore directory not found:', semaphoreDir);
}

