import { Group } from '@semaphore-protocol/group';

/**
 * Group Manager - Framework-agnostic group management
 * Uses a storage adapter pattern to support different storage backends
 */
export class GroupManager {
  constructor(options = {}) {
    const {
      storage,
      groupId = 1,
      treeDepth = 20
    } = options;
    
    if (!storage) {
      throw new Error('Storage adapter is required');
    }
    
    this.storage = storage;
    this.groupId = groupId;
    this.treeDepth = treeDepth;
    this.cache = null;
    this.cacheTimestamp = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Normalize commitment value
   */
  normalizeCommitmentValue(value) {
    return String(value ?? '').trim();
  }

  /**
   * Normalize members array
   */
  normalizeMembersArray(members) {
    if (!Array.isArray(members)) {
      return [];
    }
    return members.map((m) => this.normalizeCommitmentValue(m)).filter((m) => m.length > 0);
  }

  /**
   * Initialize group with default values
   */
  initializeGroup(data = null) {
    const DEFAULT_GROUP = { id: this.groupId, treeDepth: this.treeDepth, members: [], root: null };
    
    if (!data || typeof data !== 'object') {
      data = { ...DEFAULT_GROUP };
    }
    if (!Array.isArray(data.members)) {
      data.members = [];
    } else {
      data.members = this.normalizeMembersArray(data.members);
    }
    if (!data.root || data.members.length === 0) {
      const group = new Group(data.id, data.treeDepth, []);
      data.root = group.root.toString();
    }
    return data;
  }

  /**
   * Get group data with caching
   */
  async getGroupData() {
    const now = Date.now();
    
    if (this.cache && this.cacheTimestamp && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.cache;
    }

    let data;
    try {
      data = await this.storage.load();
    } catch (error) {
      // If storage doesn't exist, create default
      data = null;
    }
    
    data = this.initializeGroup(data);
    data.members = this.normalizeMembersArray(data.members);
    
    this.cache = data;
    this.cacheTimestamp = now;
    
    return data;
  }

  /**
   * Save group data with caching
   */
  async saveGroupData(data) {
    if (!data) {
      throw new Error('Group data is required');
    }
    
    if (!data.id || !data.treeDepth || !Array.isArray(data.members)) {
      throw new Error('Invalid group data structure');
    }
    
    data.members = this.normalizeMembersArray(data.members);
    
    await this.storage.save(data);
    
    this.cache = { ...data };
    this.cacheTimestamp = Date.now();
    
    return true;
  }

  /**
   * Add member to group
   */
  async addMember(commitment) {
    const incoming = this.normalizeCommitmentValue(commitment);
    
    const currentGroupData = await this.getGroupData();
    currentGroupData.members = this.normalizeMembersArray(currentGroupData.members);
    
    const alreadyExists = currentGroupData.members.some((m) => this.normalizeCommitmentValue(m) === incoming);
    if (alreadyExists) {
      return false;
    }
    
    currentGroupData.members.push(incoming);
    
    const group = new Group(currentGroupData.id, currentGroupData.treeDepth, currentGroupData.members.map(BigInt));
    
    currentGroupData.root = group.root.toString();
    
    await this.saveGroupData(currentGroupData);
    
    return true;
  }

  /**
   * Remove member from group
   */
  async removeMember(commitment) {
    const incoming = this.normalizeCommitmentValue(commitment);
    
    const currentGroupData = await this.getGroupData();
    currentGroupData.members = this.normalizeMembersArray(currentGroupData.members);
    
    const index = currentGroupData.members.findIndex((m) => this.normalizeCommitmentValue(m) === incoming);
    if (index === -1) {
      return false;
    }
    
    currentGroupData.members.splice(index, 1);
    
    const group = new Group(currentGroupData.id, currentGroupData.treeDepth, currentGroupData.members.map(BigInt));
    
    currentGroupData.root = group.root.toString();
    
    await this.saveGroupData(currentGroupData);
    
    return true;
  }

  /**
   * Reset group data
   */
  async resetGroupData() {
    const defaultData = this.initializeGroup();
    await this.saveGroupData(defaultData);
    this.cache = null;
    this.cacheTimestamp = null;
    return true;
  }

  /**
   * Get Merkle root
   */
  async getMerkleRoot() {
    const currentGroupData = await this.getGroupData();
    const group = new Group(currentGroupData.id, currentGroupData.treeDepth, currentGroupData.members.map(BigInt));
    return group.root.toString();
  }

  /**
   * Get group members
   */
  async getMembers() {
    const groupData = await this.getGroupData();
    return groupData.members;
  }

  /**
   * Check if member exists
   */
  async hasMember(commitment) {
    const incoming = this.normalizeCommitmentValue(commitment);
    const members = await this.getMembers();
    return members.some((m) => this.normalizeCommitmentValue(m) === incoming);
  }
}

/**
 * File storage adapter for GroupManager
 */
export class FileStorageAdapter {
  constructor(filePath, encryptionKey = null) {
    this.filePath = filePath;
    this.encryptionKey = encryptionKey;
  }

  async load() {
    const fs = await import('fs');
    const path = await import('path');
    
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(this.filePath)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    
    // If encrypted, decrypt it
    if (data.encrypted && this.encryptionKey) {
      const cryptoModule = await import('../security/crypto.js');
      const decrypted = cryptoModule.decryptData(data, this.encryptionKey);
      return JSON.parse(decrypted);
    }
    
    return data;
  }

  async save(data) {
    const fs = await import('fs');
    const path = await import('path');
    
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let dataToSave = data;
    
    // If encryption key provided, encrypt
    if (this.encryptionKey) {
      const cryptoModule = await import('../security/crypto.js');
      const encrypted = cryptoModule.encryptData(JSON.stringify(data), this.encryptionKey);
      dataToSave = { ...encrypted, encrypted: true };
    }
    
    fs.writeFileSync(this.filePath, JSON.stringify(dataToSave, null, 2));
  }
}

