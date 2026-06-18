import { v4 as uuidv4 } from 'uuid';
import { Conversation, GroupMember, Message } from '../types';
import { storage } from '../storage';
import { eventBus } from '../events';
import { userService } from './userService';
import { messageService } from './messageService';

export class ConversationService {
  getOrCreatePrivate(
    user1Id: string,
    user2Id: string
  ): Conversation {
    if (user1Id === user2Id) {
      throw new Error('不能与自己创建私聊');
    }
    const existing = storage.findPrivateConversation(user1Id, user2Id);
    if (existing) {
      return existing;
    }
    const user1 = userService.getById(user1Id);
    const user2 = userService.getById(user2Id);
    if (!user1 || !user2) {
      throw new Error('用户不存在');
    }
    const now = Date.now();
    const members: GroupMember[] = [
      { userId: user1Id, role: 'member', joinedAt: now },
      { userId: user2Id, role: 'member', joinedAt: now },
    ];
    const conv: Conversation = {
      id: uuidv4(),
      type: 'private',
      members,
      createdAt: now,
      updatedAt: now,
    };
    storage.addConversation(conv);
    return conv;
  }

  createGroup(
    ownerId: string,
    name: string,
    memberIds: string[],
    avatar?: string,
    description?: string
  ): Conversation {
    if (!name || name.length < 2) {
      throw new Error('群名称至少2个字符');
    }
    const allIds = [ownerId, ...memberIds.filter((id) => id !== ownerId)];
    const now = Date.now();
    const members: GroupMember[] = allIds.map((id, idx) => ({
      userId: id,
      role: idx === 0 ? 'owner' : 'member',
      joinedAt: now,
    }));
    const conv: Conversation = {
      id: uuidv4(),
      type: 'group',
      name,
      avatar: avatar || '',
      description: description || '',
      ownerId,
      members,
      createdAt: now,
      updatedAt: now,
    };
    storage.addConversation(conv);
    const owner = userService.getProfile(ownerId);
    messageService.createSystemMessage(
      conv.id,
      ownerId,
      `${owner.username} 创建了群聊`
    );
    eventBus.emitGroupEvent(
      {
        eventType: 'group_updated',
        conversationId: conv.id,
        operatorId: ownerId,
        timestamp: now,
        data: { conversation: conv },
      },
      allIds
    );
    return conv;
  }

  updateGroup(
    conversationId: string,
    operatorId: string,
    updates: {
      name?: string;
      avatar?: string;
      description?: string;
    }
  ): Conversation {
    const conv = this.getConversation(conversationId);
    this.ensureGroup(conv);
    this.ensurePermission(conv, operatorId);
    const updated = storage.updateConversation(conversationId, updates);
    if (!updated) {
      throw new Error('会话不存在');
    }
    eventBus.emitGroupEvent(
      {
        eventType: 'group_updated',
        conversationId,
        operatorId,
        timestamp: Date.now(),
        data: { conversation: updated },
      },
      updated.members.map((m) => m.userId)
    );
    return updated;
  }

  dismissGroup(conversationId: string, operatorId: string): void {
    const conv = this.getConversation(conversationId);
    this.ensureGroup(conv);
    this.ensureOwner(conv, operatorId);
    const memberIds = conv.members.map((m) => m.userId);
    storage.deleteConversation(conversationId);
    eventBus.emitGroupEvent(
      {
        eventType: 'group_dismissed',
        conversationId,
        operatorId,
        timestamp: Date.now(),
      },
      memberIds
    );
  }

  addMembers(
    conversationId: string,
    operatorId: string,
    userIds: string[]
  ): Conversation {
    const conv = this.getConversation(conversationId);
    this.ensureGroup(conv);
    this.ensurePermission(conv, operatorId);
    const existingIds = new Set(conv.members.map((m) => m.userId));
    const now = Date.now();
    const newMembers: GroupMember[] = [];
    for (const uid of userIds) {
      if (!existingIds.has(uid)) {
        const user = userService.getById(uid);
        if (!user) continue;
        newMembers.push({ userId: uid, role: 'member', joinedAt: now });
      }
    }
    if (newMembers.length === 0) return conv;
    const updated = storage.updateConversation(conversationId, {
      members: [...conv.members, ...newMembers],
    })!;
    const operator = userService.getProfile(operatorId);
    for (const member of newMembers) {
      const user = userService.getProfile(member.userId);
      messageService.createSystemMessage(
        conversationId,
        operatorId,
        `${operator.username} 邀请 ${user.username} 加入了群聊`
      );
    }
    const allMemberIds = updated.members.map((m) => m.userId);
    for (const member of newMembers) {
      eventBus.emitGroupEvent(
        {
          eventType: 'member_joined',
          conversationId,
          operatorId,
          targetUserId: member.userId,
          timestamp: now,
          data: { conversation: updated },
        },
        allMemberIds
      );
    }
    return updated;
  }

  removeMember(
    conversationId: string,
    operatorId: string,
    targetUserId: string
  ): Conversation {
    const conv = this.getConversation(conversationId);
    this.ensureGroup(conv);
    this.ensurePermission(conv, operatorId);
    if (targetUserId === conv.ownerId) {
      throw new Error('不能移除群主');
    }
    const targetMember = conv.members.find((m) => m.userId === targetUserId);
    if (!targetMember) {
      throw new Error('用户不在群内');
    }
    const updated = storage.updateConversation(conversationId, {
      members: conv.members.filter((m) => m.userId !== targetUserId),
    })!;
    const operator = userService.getProfile(operatorId);
    const target = userService.getProfile(targetUserId);
    messageService.createSystemMessage(
      conversationId,
      operatorId,
      `${operator.username} 将 ${target.username} 移出了群聊`
    );
    eventBus.emitGroupEvent(
      {
        eventType: 'member_kicked',
        conversationId,
        operatorId,
        targetUserId,
        timestamp: Date.now(),
      },
      [...updated.members.map((m) => m.userId), targetUserId]
    );
    return updated;
  }

  leaveGroup(conversationId: string, userId: string): Conversation {
    const conv = this.getConversation(conversationId);
    this.ensureGroup(conv);
    if (userId === conv.ownerId) {
      throw new Error('群主不能退出群聊，请先解散或转让');
    }
    const member = conv.members.find((m) => m.userId === userId);
    if (!member) {
      throw new Error('用户不在群内');
    }
    const updated = storage.updateConversation(conversationId, {
      members: conv.members.filter((m) => m.userId !== userId),
    })!;
    const user = userService.getProfile(userId);
    messageService.createSystemMessage(
      conversationId,
      userId,
      `${user.username} 退出了群聊`
    );
    eventBus.emitGroupEvent(
      {
        eventType: 'member_left',
        conversationId,
        operatorId: userId,
        targetUserId: userId,
        timestamp: Date.now(),
      },
      updated.members.map((m) => m.userId)
    );
    return updated;
  }

  setAdmin(
    conversationId: string,
    operatorId: string,
    targetUserId: string,
    isAdmin: boolean
  ): Conversation {
    const conv = this.getConversation(conversationId);
    this.ensureGroup(conv);
    this.ensureOwner(conv, operatorId);
    const memberIds = conv.members.map((m) => m.userId);
    if (!memberIds.includes(targetUserId)) {
      throw new Error('用户不在群内');
    }
    const updated = storage.updateConversation(conversationId, {
      members: conv.members.map((m) =>
        m.userId === targetUserId
          ? { ...m, role: isAdmin ? 'admin' : 'member' }
          : m
      ),
    })!;
    eventBus.emitGroupEvent(
      {
        eventType: isAdmin ? 'admin_set' : 'admin_removed',
        conversationId,
        operatorId,
        targetUserId,
        timestamp: Date.now(),
        data: { conversation: updated },
      },
      updated.members.map((m) => m.userId)
    );
    return updated;
  }

  getConversation(conversationId: string): Conversation {
    const conv = storage.getConversation(conversationId);
    if (!conv) {
      throw new Error('会话不存在');
    }
    return conv;
  }

  getUserConversations(userId: string): Conversation[] {
    return storage.getUserConversations(userId);
  }

  ensureMember(conv: Conversation, userId: string): void {
    if (!conv.members.some((m) => m.userId === userId)) {
      throw new Error('无权访问此会话');
    }
  }

  private ensureGroup(conv: Conversation): void {
    if (conv.type !== 'group') {
      throw new Error('此操作仅支持群聊');
    }
  }

  private ensurePermission(conv: Conversation, userId: string): void {
    const member = conv.members.find((m) => m.userId === userId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw new Error('权限不足');
    }
  }

  private ensureOwner(conv: Conversation, userId: string): void {
    if (conv.ownerId !== userId) {
      throw new Error('仅群主可执行此操作');
    }
  }

  getUnreadCounts(userId: string): Record<string, number> {
    return storage.getUserUnreadCounts(userId);
  }
}

export const conversationService = new ConversationService();
