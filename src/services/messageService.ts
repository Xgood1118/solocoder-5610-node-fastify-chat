import { v4 as uuidv4 } from 'uuid';
import {
  Message,
  MessageType,
  MentionInfo,
  MessageStatus,
  Conversation,
} from '../types';
import { storage } from '../storage';
import { eventBus } from '../events';
import { userService } from './userService';
import { conversationService } from './conversationService';

export class MessageService {
  sendMessage(params: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string;
    metadata?: Record<string, any>;
    replyTo?: string;
    mentions?: MentionInfo[];
  }): Message {
    const { conversationId, senderId, type, content, metadata, replyTo, mentions } = params;
    const conv = conversationService.getConversation(conversationId);
    conversationService.ensureMember(conv, senderId);
    let quote;
    if (replyTo) {
      const repliedMsg = storage.getMessage(replyTo);
      if (repliedMsg) {
        quote = {
          messageId: repliedMsg.id,
          senderId: repliedMsg.senderId,
          content: repliedMsg.content,
          type: repliedMsg.type,
        };
      }
    }
    const now = Date.now();
    const message: Message = {
      id: uuidv4(),
      conversationId,
      senderId,
      type,
      content,
      metadata,
      replyTo,
      quote,
      mentions,
      status: 'sent',
      readBy: [senderId],
      timestamp: now,
    };
    storage.addMessage(message);
    const memberIds = conv.members.map((m) => m.userId);
    for (const uid of memberIds) {
      if (uid !== senderId) {
        storage.incrementUnread(conversationId, uid);
      }
    }
    eventBus.emitNewMessage(
      { message, conversation: conv },
      senderId
    );
    if (mentions && mentions.length > 0) {
      const sender = userService.getProfile(senderId);
      for (const mention of mentions) {
        if (mention.userId !== senderId) {
          eventBus.emitMention(mention.userId, {
            message,
            conversationId,
            conversationName: conv.name,
            senderUsername: sender.username,
          });
        }
      }
    }
    return message;
  }

  createSystemMessage(
    conversationId: string,
    operatorId: string,
    content: string
  ): Message {
    const now = Date.now();
    const message: Message = {
      id: uuidv4(),
      conversationId,
      senderId: operatorId,
      type: 'system',
      content,
      status: 'sent',
      readBy: [],
      timestamp: now,
    };
    storage.addMessage(message);
    const conv = storage.getConversation(conversationId);
    if (conv) {
      const memberIds = conv.members.map((m) => m.userId);
      for (const uid of memberIds) {
        if (uid !== operatorId) {
          storage.incrementUnread(conversationId, uid);
        }
      }
    }
    return message;
  }

  getHistory(
    conversationId: string,
    userId: string,
    before?: number,
    limit: number = 50
  ): Message[] {
    const conv = conversationService.getConversation(conversationId);
    conversationService.ensureMember(conv, userId);
    return storage.getMessages(conversationId, before, limit);
  }

  markRead(conversationId: string, userId: string): string[] {
    const conv = conversationService.getConversation(conversationId);
    conversationService.ensureMember(conv, userId);
    const messageIds = storage.markConversationRead(conversationId, userId);
    const notifiedSenders = new Set<string>();
    for (const msgId of messageIds) {
      const msg = storage.getMessage(msgId);
      if (msg && msg.senderId !== userId && !notifiedSenders.has(msg.senderId)) {
        notifiedSenders.add(msg.senderId);
        eventBus.emitMessageRead(
          {
            messageId: msgId,
            conversationId,
            userId,
            timestamp: Date.now(),
          },
          msg.senderId
        );
      }
    }
    return messageIds;
  }

  updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    userId: string
  ): Message | undefined {
    const msg = storage.updateMessageStatus(messageId, status, userId);
    if (msg && status === 'delivered') {
      eventBus.emitMessageDelivered({
        messageId,
        conversationId: msg.conversationId,
        userId,
        timestamp: Date.now(),
      });
    }
    if (msg && status === 'read' && msg.senderId !== userId) {
      eventBus.emitMessageRead(
        {
          messageId,
          conversationId: msg.conversationId,
          userId,
          timestamp: Date.now(),
        },
        msg.senderId
      );
    }
    return msg;
  }

  deliverMessagesForUser(userId: string): Message[] {
    const convs = conversationService.getUserConversations(userId);
    const delivered: Message[] = [];
    for (const conv of convs) {
      const messages = storage.getMessages(conv.id, undefined, 100);
      for (const msg of messages) {
        if (msg.senderId !== userId && msg.status === 'sent') {
          const updated = storage.updateMessageStatus(msg.id, 'delivered', userId);
          if (updated) {
            delivered.push(updated);
            eventBus.emitMessageDelivered({
              messageId: msg.id,
              conversationId: conv.id,
              userId,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
    return delivered;
  }

  getOfflineMessages(userId: string): { conversation: Conversation; messages: Message[] }[] {
    const convs = conversationService.getUserConversations(userId);
    const result: { conversation: Conversation; messages: Message[] }[] = [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const conv of convs) {
      const count = storage.getUnreadCount(conv.id, userId);
      if (count > 0) {
        const messages = storage.getMessages(conv.id, undefined, Math.max(count, 50));
        const relevant = messages.filter(
          (m) => m.senderId !== userId && !m.readBy.includes(userId) && m.timestamp >= cutoff
        );
        if (relevant.length > 0) {
          result.push({ conversation: conv, messages: relevant.reverse() });
        }
      }
    }
    return result;
  }
}

export const messageService = new MessageService();
