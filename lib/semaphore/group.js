import { Group } from '@semaphore-protocol/group';
import path from 'path';
import fs from 'fs';
import { encryptToFile, decryptFromFile } from '../security/encryption.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const GROUP_FILE = path.join(DATA_DIR, 'group.json');

let groupDataCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DEFAULT_GROUP = { id: 1, treeDepth: 20, members: [], root: null };

function normalizeCommitmentValue(value) {
  return String(value ?? '').trim();
}

function normalizeMembersArray(members) {
  if (!Array.isArray(members)) {
    return [];
  }
  return members.map((m) => normalizeCommitmentValue(m)).filter((m) => m.length > 0);
}

/**
 * Initialize group with default values
 */
function initializeGroup(data = DEFAULT_GROUP) {
  // Defensive normalization
  if (!data || typeof data !== 'object') {
    data = { ...DEFAULT_GROUP };
  }
  if (!Array.isArray(data.members)) {
    data.members = [];
  } else {
    data.members = normalizeMembersArray(data.members);
  }
  if (!data.root || data.members.length === 0) {
    const group = new Group(data.id, data.treeDepth, []);
    data.root = group.root.toString();
  }
  return data;
}

/**
 * Load group data from file or create default
 */
function loadGroupFromFile() {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Creating data directory:', DATA_DIR);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    if (fs.existsSync(GROUP_FILE)) {
      try {
        const decrypted = decryptFromFile(GROUP_FILE);
        return initializeGroup(decrypted);
      } catch (decryptError) {
        console.warn('Group file not encrypted or decryption failed, attempting plaintext load and migration...');
        try {
          const plaintextData = JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8'));
          const initialized = initializeGroup(plaintextData);
          encryptToFile(GROUP_FILE, initialized);
          return initialized;
        } catch (plainError) {
          console.error('Failed to load plaintext group data:', plainError);
          throw plainError;
        }
      }
    }
  } catch (error) {
    console.error('Error loading group data:', error);
  }
  
  return initializeGroup();
}

/**
 * Save group data to file
 */
function saveGroupToFile(data) {
  try {
    if (!data) {
      throw new Error('Group data is required for file saving');
    }
    
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Creating data directory:', DATA_DIR);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    console.log('Saving encrypted group data to:', GROUP_FILE);
    encryptToFile(GROUP_FILE, data);
    console.log('Encrypted group data saved to file successfully');
  } catch (error) {
    console.error('Error saving group data to file:', error);
    throw new Error(`Failed to save group data to file: ${error.message}`);
  }
}

/**
 * Get group data with caching
 */
export async function getGroupData() {
  console.log('getGroupData called');
  
  const now = Date.now();
  
  if (groupDataCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Returning cached group data');
    return groupDataCache;
  }

  const data = loadGroupFromFile();
  // Normalize members defensively in case legacy or malformed data
  data.members = normalizeMembersArray(data.members);
  
  groupDataCache = data;
  cacheTimestamp = now;
  
  console.log('Returning group data:', {
    id: data.id,
    treeDepth: data.treeDepth,
    memberCount: data.members.length,
    hasRoot: !!data.root
  });
  
  return data;
}

/**
 * Save group data with caching
 */
export async function saveGroupData(data) {
  try {
    console.log('saveGroupData called with member count:', data.members?.length || 0);
    
    if (!data) {
      throw new Error('Group data is required');
    }
    
    if (!data.id || !data.treeDepth || !Array.isArray(data.members)) {
      throw new Error('Invalid group data structure');
    }
    data.members = normalizeMembersArray(data.members);
    
    saveGroupToFile(data);
    
    groupDataCache = { ...data };
    cacheTimestamp = Date.now();
    
    console.log('Group data saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving group data:', error);
    throw new Error(`Failed to save group data: ${error.message}`);
  }
}

export async function addMember(commitment) {
  const incoming = normalizeCommitmentValue(commitment);
  console.log('addMember called. Incoming commitment:', incoming.substring(0, 18) + (incoming.length > 18 ? '...' : ''));
  
  const currentGroupData = await getGroupData();
  currentGroupData.members = normalizeMembersArray(currentGroupData.members);
  
  const existingSample = currentGroupData.members.slice(0, 3);
  console.log('Existing members (sample):', existingSample.map((m) => m.substring(0, 18) + (m.length > 18 ? '...' : '')));
  
  const alreadyExists = currentGroupData.members.some((m) => normalizeCommitmentValue(m) === incoming);
  if (alreadyExists) {
    console.log('Member already exists, skipping');
    return false;
  }
  
  currentGroupData.members.push(incoming);
  console.log('Added member. New count:', currentGroupData.members.length);
  
  const group = new Group(currentGroupData.id, currentGroupData.treeDepth, currentGroupData.members.map(BigInt));
  
  currentGroupData.root = group.root.toString();
  console.log('Updated root:', currentGroupData.root.substring(0, 18) + '...');
  
  await saveGroupData(currentGroupData);
  console.log('Group data saved successfully');
  
  return true;
}

export async function resetGroupData() {
  try {
    console.log('resetGroupData called');
    
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Data directory does not exist, creating it');
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    if (fs.existsSync(GROUP_FILE)) {
      console.log('Removing existing group file');
      fs.unlinkSync(GROUP_FILE);
    }
    
    groupDataCache = null;
    cacheTimestamp = null;
    
    const defaultData = initializeGroup();
    console.log('Default group data prepared:', defaultData);
    
    await saveGroupData(defaultData);
    console.log('Group reset to default state successfully');
    
    return true;
  } catch (error) {
    console.error('Error in resetGroupData:', error);
    
    try {
      console.log('Attempting recovery by creating basic group file');
      const basicData = { id: 1, treeDepth: 20, members: [], root: null };
      
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      fs.writeFileSync(GROUP_FILE, JSON.stringify(basicData, null, 2));
      console.log('Recovery successful - basic group file created');
      
      groupDataCache = basicData;
      cacheTimestamp = Date.now();
      
      return true;
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
      throw new Error(`Failed to reset group data and recovery failed: ${error.message}`);
    }
  }
}

/**
 * Complete group data reset - removes all files and cache
 */
export async function completeGroupReset() {
  try {
    console.log('completeGroupReset called - performing full reset');
    
    groupDataCache = null;
    cacheTimestamp = null;
    
    if (fs.existsSync(GROUP_FILE)) {
      console.log('Removing group file:', GROUP_FILE);
      fs.unlinkSync(GROUP_FILE);
    }
    
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Do not recreate the file here; leave it deleted until the next write
    const defaultData = initializeGroup();
    console.log('Fresh default group data prepared in memory (file not recreated)');
    groupDataCache = defaultData;
    cacheTimestamp = Date.now();
    
    console.log('Complete group reset successful');
    return true;
    
  } catch (error) {
    console.error('Error in completeGroupReset:', error);
    throw new Error(`Complete group reset failed: ${error.message}`);
  }
}

export async function getMerkleRoot() {
  const currentGroupData = await getGroupData();
  const group = new Group(currentGroupData.id, currentGroupData.treeDepth, currentGroupData.members.map(BigInt));
  return group.root.toString();
} 