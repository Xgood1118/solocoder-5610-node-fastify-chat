import { User, Conversation, Message, PublicUser, MessageStatus } from '../types';

export class InMemoryStorage {
  private users: Map<string, User> = new Map();
  private usernameIndex: Map<string, string> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private messageIndex: Map<string, string> = new Map();
  private unreadCounts: Map<string, Map<string, number>> = new Map();

  addUser(user: User): void {
    this.users.set(user.id, user);
    this.usernameIndex.set(user.username.toLowerCase(), user.id);
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByUsername(username: string): User | undefined {
    const id = this.usernameIndex.get(username.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }

  getPublicUser(id: string): PublicUser | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    const { password: _, ...publicUser } = user;
    return publicUser as PublicUser;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    if (updates.username && updates.username !== user.username) {
      this.usernameIndex.delete(user.username.toLowerCase());
      this.usernameIndex.set(updates.username.toLowerCase(), id);
    }
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  searchUsers(query: string, limit: number = 20): PublicUser[] {
    const q = query.toLowerCase();
    const results: PublicUser[] = [];
    for (const user of this.users.values()) {
      if (user.username.toLowerCase().includes(q)) {
        const { password: _, ...publicUser } = user;
        results.push(publicUser as PublicUser);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  addConversation(conversation: Conversation): void {
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  updateConversation(id: string, updates: Partial<Conversation>): Conversation | undefined {
    const conv = this.conversations.get(id);
    if (!conv) return undefined;
    const updated = { ...conv, ...updates, updatedAt: Date.now() };
    this.conversations.set(id, updated);
    return updated;
  }

  deleteConversation(id: string): boolean {
    this.conversations.delete(id);
    this.messages.delete(id);
    return true;
  }

  getUserConversations(userId: string): Conversation[] {
    const result: Conversation[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.members.some((m) => m.userId === userId)) {
        result.push(conv);
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  findPrivateConversation(user1Id: string, user2Id: string): Conversation | undefined {
    for (const conv of this.conversations.values()) {
      if (conv.type === 'private' && conv.members.length === 2) {
        const ids = conv.members.map((m) => m.userId).sort();
        const target = [user1Id, user2Id].sort();
        if (ids[0] === target[0] && ids[1] === target[1]) {
          return conv;
        }
      }
    }
    return undefined;
  }

  addMessage(message: Message): void {
    const convMessages = this.messages.get(message.conversationId);
    if (!convMessages) return;
    convMessages.push(message);
    this.messageIndex.set(message.id, message.conversationId);
    const conv = this.conversations.get(message.conversationId);
    if (conv) {
      conv.updatedAt = message.timestamp;
    }
  }

  getMessage(id: string): Message | undefined {
    const convId = this.messageIndex.get(id);
    if (!convId) return undefined;
    const messages = this.messages.get(convId);
    return messages?.find((m) => m.id === id);
  }

  getMessages(
    conversationId: string,
    before?: number,
    limit: number = 50
  ): Message[] {
    const convMessages = this.messages.get(conversationId);
    if (!convMessages) return [];
    let filtered = convMessages;
    if (before) {
      filtered = convMessages.filter((m) => m.timestamp < before);
    }
    return filtered.slice(-limit).reverse();
  }

  updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    userId?: string
  ): Message | undefined {
    const convId = this.messageIndex.get(messageId);
    if (!convId) return undefined;
    const messages = this.messages.get(convId);
    if (!messages) return undefined;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return undefined;
    msg.status = status;
    if (userId && !msg.readBy.includes(userId)) {
      msg.readBy.push(userId);
    }
    return msg;
  }

  markConversationRead(conversationId: string, userId: string): string[] {
    const convMessages = this.messages.get(conversationId);
    if (!convMessages) return [];
    const updatedIds: string[] = [];
    for (const msg of convMessages) {
      if (msg.senderId !== userId && !msg.readBy.includes(userId)) {
        msg.readBy.push(userId);
        if (msg.status !== 'read') {
          msg.status = 'read';
        }
        updatedIds.push(msg.id);
      }
    }
    this.setUnreadCount(conversationId, userId, 0);
    return updatedIds;
  }

  incrementUnread(conversationId: string, userId: string): void {
    if (!this.unreadCounts.has(conversationId)) {
      this.unreadCounts.set(conversationId, new Map());
    }
    const convMap = this.unreadCounts.get(conversationId)!;
    convMap.set(userId, (convMap.get(userId) || 0) + 1);
  }

  setUnreadCount(conversationId: string, userId: string, count: number): void {
    if (!this.unreadCounts.has(conversationId)) {
      this.unreadCounts.set(conversationId, new Map());
    }
    this.unreadCounts.get(conversationId)!.set(userId, count);
  }

  getUnreadCount(conversationId: string, userId: string): number {
    return this.unreadCounts.get(conversationId)?.get(userId) || 0;
  }

  getUserUnreadCounts(userId: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [convId, userMap] of this.unreadCounts.entries()) {
      const count = userMap.get(userId);
      if (count) result[convId] = count;
    }
    return result;
  }

  purgeOldMessages(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let purged = 0;
    for (const [convId, messages] of this.messages.entries()) {
      const kept = messages.filter((m) => m.timestamp >= cutoff);
      purged += messages.length - kept.length;
      if (kept.length === 0) {
        this.messages.set(convId, []);
      } else {
        this.messages.set(convId, kept);
        for (const removed of messages.filter((m) => m.timestamp < cutoff)) {
          this.messageIndex.delete(removed.id);
        }
      }
    }
    return purged;
  }
}

export const storage = new InMemoryStorage();
