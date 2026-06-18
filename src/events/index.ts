import {
  WSEvent,
  WSEventType,
  NewMessageEvent,
  MessageStatusEvent,
  UserStatusEvent,
  TypingEvent,
  GroupEvent,
  MentionEvent,
  UploadProgressEvent,
} from '../types';

type EventCallback<T = any> = (event: WSEvent<T>) => void;

export class EventBus {
  private listeners: Map<WSEventType, Set<EventCallback>> = new Map();
  private userListeners: Map<string, Map<WSEventType, Set<EventCallback>>> = new Map();

  on(eventType: WSEventType, callback: EventCallback): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  off(eventType: WSEventType, callback: EventCallback): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  onUser(userId: string, eventType: WSEventType, callback: EventCallback): void {
    if (!this.userListeners.has(userId)) {
      this.userListeners.set(userId, new Map());
    }
    const userMap = this.userListeners.get(userId)!;
    if (!userMap.has(eventType)) {
      userMap.set(eventType, new Set());
    }
    userMap.get(eventType)!.add(callback);
  }

  offUser(userId: string, eventType: WSEventType, callback: EventCallback): void {
    this.userListeners.get(userId)?.get(eventType)?.delete(callback);
  }

  removeAllUserListeners(userId: string): void {
    this.userListeners.delete(userId);
  }

  private emit(eventType: WSEventType, data: any): void {
    const event: WSEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
    };
    this.listeners.get(eventType)?.forEach((cb) => {
      try {
        cb(event);
      } catch (e) {
        console.error('Event listener error:', e);
      }
    });
  }

  emitToUser(userId: string, eventType: WSEventType, data: any): void {
    const event: WSEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
    };
    this.userListeners.get(userId)?.get(eventType)?.forEach((cb) => {
      try {
        cb(event);
      } catch (e) {
        console.error('User event listener error:', e);
      }
    });
    this.emit(eventType, data);
  }

  emitToUsers(userIds: string[], eventType: WSEventType, data: any): void {
    for (const userId of userIds) {
      this.emitToUser(userId, eventType, data);
    }
  }

  emitNewMessage(data: NewMessageEvent, excludeUserId?: string): void {
    const userIds = data.conversation.members
      .map((m) => m.userId)
      .filter((id) => id !== excludeUserId);
    this.emitToUsers(userIds, 'new_message', data);
  }

  emitMessageDelivered(data: MessageStatusEvent): void {
    const msgData: MessageStatusEvent = { ...data, timestamp: Date.now() };
    this.emitToUser(data.userId, 'message_delivered', msgData);
  }

  emitMessageRead(data: MessageStatusEvent, targetUserId: string): void {
    const msgData: MessageStatusEvent = { ...data, timestamp: Date.now() };
    this.emitToUser(targetUserId, 'message_read', msgData);
  }

  emitUserStatusChanged(data: UserStatusEvent): void {
    this.emit('user_status_changed', data);
  }

  emitTyping(data: TypingEvent, excludeUserId?: string): void {
    const event: TypingEvent = { ...data };
    this.emit('typing', event);
  }

  emitGroupEvent(data: GroupEvent, memberIds?: string[]): void {
    const event: GroupEvent = { ...data, timestamp: Date.now() };
    if (memberIds) {
      this.emitToUsers(memberIds, 'group_event', event);
    } else {
      this.emit('group_event', event);
    }
  }

  emitMention(userId: string, data: MentionEvent): void {
    this.emitToUser(userId, 'mention', data);
  }

  emitUploadProgress(userId: string, data: UploadProgressEvent): void {
    this.emitToUser(userId, 'upload_progress', data);
  }

  emitError(userId: string, error: string | Error): void {
    this.emitToUser(userId, 'error', {
      message: typeof error === 'string' ? error : error.message,
    });
  }
}

export const eventBus = new EventBus();
