import { Group } from '@semaphore-protocol/group';
import path from 'path';
import fs from 'fs';

// File paths for storage
const DATA_DIR = path.join(process.cwd(), 'data');
const GROUP_FILE = path.join(DATA_DIR, 'group.json');

// In-memory cache for performance
let groupDataCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Default group structure
const DEFAULT_GROUP = { id: 1, treeDepth: 20, members: [], root: null };

/**
 * Initialize group with default values
 */
function initializeGroup(data = DEFAULT_GROUP) {
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
      const data = JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8'));
      return initializeGroup(data);
    }
  } catch (error) {
    console.error('Error loading group data:', error);
  }
  
  // Return default if no file exists or loading failed
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
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Creating data directory:', DATA_DIR);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Save data as JSON
    console.log('Saving group data to:', GROUP_FILE);
    fs.writeFileSync(GROUP_FILE, JSON.stringify(data, null, 2));
    console.log('Group data saved to file successfully');
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
  
  // Check cache validity
  if (groupDataCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Returning cached group data');
    return groupDataCache;
  }
  
  // Load from file
  const data = loadGroupFromFile();
  
  // Update cache
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
    
    // Validate data structure
    if (!data.id || !data.treeDepth || !Array.isArray(data.members)) {
      throw new Error('Invalid group data structure');
    }
    
    // Save to file
    saveGroupToFile(data);
    
    // Update cache
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
  console.log('addMember called with commitment:', commitment);
  
  const currentGroupData = await getGroupData();
  console.log('Current group data:', currentGroupData);
  
  if (currentGroupData.members.includes(commitment)) {
    console.log('Member already exists, skipping');
    return false;
  }
  
  // Add the new member
  currentGroupData.members.push(commitment);
  console.log('Added member, new members array:', currentGroupData.members);
  
  // Create a new Group instance with updated members
  const group = new Group(currentGroupData.id, currentGroupData.treeDepth, currentGroupData.members.map(BigInt));
  
  // Update the root
  currentGroupData.root = group.root.toString();
  console.log('Updated root:', currentGroupData.root);
  
  // Save the updated data
  await saveGroupData(currentGroupData);
  console.log('Group data saved successfully');
  
  return true;
}

export async function resetGroupData() {
  try {
    console.log('resetGroupData called');
    
    // Check if data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Data directory does not exist, creating it');
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Remove existing group file if it exists
    if (fs.existsSync(GROUP_FILE)) {
      console.log('Removing existing group file');
      fs.unlinkSync(GROUP_FILE);
    }
    
    // Clear the cache
    groupDataCache = null;
    cacheTimestamp = null;
    
    const defaultData = initializeGroup();
    console.log('Default group data prepared:', defaultData);
    
    // Save the default data
    await saveGroupData(defaultData);
    console.log('Group reset to default state successfully');
    
    return true;
  } catch (error) {
    console.error('Error in resetGroupData:', error);
    
    // Try to recover by creating a basic group file
    try {
      console.log('Attempting recovery by creating basic group file');
      const basicData = { id: 1, treeDepth: 20, members: [], root: null };
      
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      // Write basic JSON file as fallback
      fs.writeFileSync(GROUP_FILE, JSON.stringify(basicData, null, 2));
      console.log('Recovery successful - basic group file created');
      
      // Clear cache
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
    
    // Clear cache first
    groupDataCache = null;
    cacheTimestamp = null;
    
    // Remove group file if it exists
    if (fs.existsSync(GROUP_FILE)) {
      console.log('Removing group file:', GROUP_FILE);
      fs.unlinkSync(GROUP_FILE);
    }
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Create fresh default group
    const defaultData = initializeGroup();
    console.log('Fresh default group data created');
    
    // Save as JSON file
    fs.writeFileSync(GROUP_FILE, JSON.stringify(defaultData, null, 2));
    console.log('Fresh group.json file created');
    
    // Update cache
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