import { WebSocket } from 'ws';

export type UserStatus = 'online' | 'offline' | 'dnd' | 'invisible';

export interface User {
  id: string;
  username: string;
  password: string;
  avatar: string;
  signature: string;
  status: UserStatus;
  lastOnline: number;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  username: string;
  avatar: string;
  signature: string;
  status: UserStatus;
  lastOnline: number;
}

export type ConversationType = 'private' | 'group';

export interface GroupMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatar?: string;
  description?: string;
  ownerId?: string;
  members: GroupMember[];
  createdAt: number;
  updatedAt: number;
}

export type MessageType =
  | 'text'
  | 'emoji'
  | 'image'
  | 'file'
  | 'voice'
  | 'video'
  | 'location'
  | 'card'
  | 'system';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface MentionInfo {
  userId: string;
  username: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  metadata?: Record<string, any>;
  replyTo?: string;
  quote?: {
    messageId: string;
    senderId: string;
    content: string;
    type: MessageType;
  };
  mentions?: MentionInfo[];
  status: MessageStatus;
  readBy: string[];
  timestamp: number;
}

export interface WSConnection {
  userId: string;
  socket: WebSocket;
  connectedAt: number;
}

export type WSEventType =
  | 'new_message'
  | 'message_delivered'
  | 'message_read'
  | 'user_status_changed'
  | 'typing'
  | 'group_event'
  | 'mention'
  | 'upload_progress'
  | 'error';

export interface WSEvent<T = any> {
  type: WSEventType;
  data: T;
  timestamp: number;
}

export interface NewMessageEvent {
  message: Message;
  conversation: Conversation;
}

export interface MessageStatusEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  timestamp: number;
}

export interface UserStatusEvent {
  userId: string;
  status: UserStatus;
  lastOnline: number;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

export type GroupEventType =
  | 'member_joined'
  | 'member_left'
  | 'member_kicked'
  | 'group_dismissed'
  | 'group_updated'
  | 'admin_set'
  | 'admin_removed';

export interface GroupEvent {
  eventType: GroupEventType;
  conversationId: string;
  operatorId?: string;
  targetUserId?: string;
  timestamp: number;
  data?: any;
}

export interface MentionEvent {
  message: Message;
  conversationId: string;
  conversationName?: string;
  senderUsername: string;
}

export interface UploadProgressEvent {
  uploadId: string;
  progress: number;
  filename: string;
}

export interface ServerConfig {
  port: number;
  jwtSecret: string;
  uploadDir: string;
  maxFileSize: number;
  messageRetentionDays: number;
  pageSize: number;
}

export interface JwtPayload {
  userId: string;
  username: string;
}
