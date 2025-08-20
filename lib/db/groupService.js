import { eq, and, desc, asc } from 'drizzle-orm';
import { Group } from '@semaphore-protocol/group';
import { db } from './connection.js';
import { groups, groupMembers, auditLog } from './schema.js';

/**
 * PostgreSQL-based Semaphore Group Service
 * Replaces JSON file storage with proper database operations
 */

/**
 * Get or create a group
 * @param {number} groupId - Group ID
 * @param {number} treeDepth - Tree depth (default: 20)
 * @returns {Promise<Object>} Group data
 */
export async function getOrCreateGroup(groupId = 1, treeDepth = 20) {
  try {
    console.log(`Getting or creating group ${groupId}`);
    
    // Try to get existing group
    let group = await db.select().from(groups).where(eq(groups.groupId, groupId)).limit(1);
    
    if (group.length === 0) {
      // Create new group
      console.log(`Creating new group ${groupId} with tree depth ${treeDepth}`);
      
      const emptyGroup = new Group(groupId, treeDepth, []);
      const root = emptyGroup.root.toString();
      
      const [newGroup] = await db.insert(groups).values({
        groupId,
        treeDepth,
        root,
      }).returning();
      
      await logAudit('CREATE_GROUP', 'group', groupId.toString(), null, null, {
        groupId,
        treeDepth,
        root,
      }, true);
      
      group = [newGroup];
    }
    
    // Get all members for this group
    const members = await db.select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(asc(groupMembers.memberIndex));
    
    const memberCommitments = members.map(m => m.commitment);
    
    console.log(`Group ${groupId} loaded with ${memberCommitments.length} members`);
    
    return {
      id: group[0].groupId,
      treeDepth: group[0].treeDepth,
      members: memberCommitments,
      root: group[0].root,
      createdAt: group[0].createdAt,
      updatedAt: group[0].updatedAt,
    };
  } catch (error) {
    console.error('Error in getOrCreateGroup:', error);
    await logAudit('GET_CREATE_GROUP', 'group', groupId.toString(), null, null, { error: error.message }, false);
    throw new Error(`Failed to get or create group: ${error.message}`);
  }
}

/**
 * Add a member to a group
 * @param {number} groupId - Group ID
 * @param {string} commitment - Member commitment
 * @param {string} userEmail - User email for audit
 * @param {string} sessionId - Session ID for audit
 * @returns {Promise<boolean>} True if added, false if already exists
 */
export async function addMemberToGroup(groupId, commitment, userEmail = null, sessionId = null) {
  try {
    console.log(`Adding member to group ${groupId}:`, commitment.substring(0, 18) + '...');
    
    // Check if member already exists
    const existingMember = await db.select()
      .from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.commitment, commitment)
      ))
      .limit(1);
    
    if (existingMember.length > 0) {
      console.log('Member already exists in group');
      await logAudit('ADD_MEMBER_DUPLICATE', 'group_member', `${groupId}:${commitment}`, userEmail, sessionId, {
        groupId,
        commitment: commitment.substring(0, 18) + '...',
      }, true);
      return false;
    }
    
    // Get current member count for index
    const memberCount = await db.select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    
    const memberIndex = memberCount.length;
    
    // Add the member
    await db.insert(groupMembers).values({
      groupId,
      commitment,
      memberIndex,
    });
    
    // Update group root
    const groupData = await getOrCreateGroup(groupId);
    const semaphoreGroup = new Group(groupId, groupData.treeDepth, groupData.members.map(BigInt));
    const newRoot = semaphoreGroup.root.toString();
    
    await db.update(groups)
      .set({ 
        root: newRoot,
        updatedAt: new Date(),
      })
      .where(eq(groups.groupId, groupId));
    
    console.log(`Member added successfully. New member count: ${memberIndex + 1}`);
    console.log('Updated root:', newRoot.substring(0, 18) + '...');
    
    await logAudit('ADD_MEMBER_SUCCESS', 'group_member', `${groupId}:${commitment}`, userEmail, sessionId, {
      groupId,
      commitment: commitment.substring(0, 18) + '...',
      memberIndex,
      newRoot: newRoot.substring(0, 18) + '...',
      memberCount: memberIndex + 1,
    }, true);
    
    return true;
  } catch (error) {
    console.error('Error adding member to group:', error);
    await logAudit('ADD_MEMBER_ERROR', 'group_member', `${groupId}:${commitment}`, userEmail, sessionId, {
      error: error.message,
      groupId,
      commitment: commitment.substring(0, 18) + '...',
    }, false);
    throw new Error(`Failed to add member to group: ${error.message}`);
  }
}

/**
 * Get full group data including all members
 * @param {number} groupId - Group ID
 * @returns {Promise<Object>} Complete group data
 */
export async function getFullGroupData(groupId = 1) {
  try {
    const groupData = await getOrCreateGroup(groupId);
    
    await logAudit('GET_GROUP_DATA', 'group', groupId.toString(), null, null, {
      groupId,
      memberCount: groupData.members.length,
    }, true);
    
    return groupData;
  } catch (error) {
    console.error('Error getting full group data:', error);
    await logAudit('GET_GROUP_DATA', 'group', groupId.toString(), null, null, {
      error: error.message,
      groupId,
    }, false);
    throw error;
  }
}

/**
 * Reset a group (remove all members)
 * @param {number} groupId - Group ID
 * @param {string} userEmail - User email for audit
 * @param {string} sessionId - Session ID for audit
 * @returns {Promise<boolean>} Success status
 */
export async function resetGroup(groupId = 1, userEmail = null, sessionId = null) {
  try {
    console.log(`Resetting group ${groupId}`);
    
    // Get current member count for audit
    const currentMembers = await db.select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    
    // Remove all members
    await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
    
    // Reset group root
    const emptyGroup = new Group(groupId, 20, []);
    const newRoot = emptyGroup.root.toString();
    
    await db.update(groups)
      .set({ 
        root: newRoot,
        updatedAt: new Date(),
      })
      .where(eq(groups.groupId, groupId));
    
    console.log(`Group ${groupId} reset successfully. Removed ${currentMembers.length} members`);
    
    await logAudit('RESET_GROUP', 'group', groupId.toString(), userEmail, sessionId, {
      groupId,
      removedMemberCount: currentMembers.length,
      newRoot: newRoot.substring(0, 18) + '...',
    }, true);
    
    return true;
  } catch (error) {
    console.error('Error resetting group:', error);
    await logAudit('RESET_GROUP', 'group', groupId.toString(), userEmail, sessionId, {
      error: error.message,
      groupId,
    }, false);
    throw new Error(`Failed to reset group: ${error.message}`);
  }
}

/**
 * Check if a commitment exists in a group
 * @param {number} groupId - Group ID
 * @param {string} commitment - Member commitment
 * @returns {Promise<boolean>} True if member exists
 */
export async function isMemberInGroup(groupId, commitment) {
  try {
    const member = await db.select()
      .from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.commitment, commitment)
      ))
      .limit(1);
    
    return member.length > 0;
  } catch (error) {
    console.error('Error checking group membership:', error);
    return false;
  }
}

/**
 * Get group statistics
 * @param {number} groupId - Group ID
 * @returns {Promise<Object>} Group statistics
 */
export async function getGroupStats(groupId = 1) {
  try {
    const group = await db.select().from(groups).where(eq(groups.groupId, groupId)).limit(1);
    const memberCount = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
    
    return {
      exists: group.length > 0,
      memberCount: memberCount.length,
      createdAt: group[0]?.createdAt,
      updatedAt: group[0]?.updatedAt,
      treeDepth: group[0]?.treeDepth,
    };
  } catch (error) {
    console.error('Error getting group stats:', error);
    return {
      exists: false,
      memberCount: 0,
      createdAt: null,
      updatedAt: null,
      treeDepth: null,
    };
  }
}

/**
 * Log audit events
 * @param {string} action - Action performed
 * @param {string} entityType - Type of entity
 * @param {string} entityId - Entity ID
 * @param {string} userEmail - User email
 * @param {string} sessionId - Session ID
 * @param {Object} metadata - Additional metadata
 * @param {boolean} success - Success status
 */
async function logAudit(action, entityType, entityId, userEmail, sessionId, metadata, success) {
  try {
    await db.insert(auditLog).values({
      action,
      entityType,
      entityId,
      userEmail,
      sessionId,
      metadata: JSON.stringify(metadata),
      success,
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw here to avoid breaking the main operation
  }
}