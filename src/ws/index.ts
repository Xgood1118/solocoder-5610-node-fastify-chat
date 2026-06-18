import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { SocketStream } from '@fastify/websocket';
import { WSConnection, WSEvent, WSEventType, JwtPayload } from '../types';
import { authenticateWs } from '../auth';
import { eventBus } from '../events';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';
import { conversationService } from '../services/conversationService';
import { eventBus as eBus } from '../events';

interface IncomingMessage {
  type: string;
  data?: any;
}

export class WebSocketManager {
  private connections: Map<string, WSConnection[]> = new Map();
  private fastify!: FastifyInstance;

  init(fastify: FastifyInstance): void {
    this.fastify = fastify;
  }

  addConnection(userId: string, socket: WebSocket): void {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, []);
    }
    const conn: WSConnection = {
      userId,
      socket,
      connectedAt: Date.now(),
    };
    this.connections.get(userId)!.push(conn);
    this.setupUserListeners(userId, conn);
    try {
      userService.setStatus(userId, 'online');
    } catch (e) {}
  }

  removeConnection(userId: string, socket: WebSocket): void {
    const userConns = this.connections.get(userId);
    if (!userConns) return;
    const idx = userConns.findIndex((c) => c.socket === socket);
    if (idx >= 0) {
      userConns.splice(idx, 1);
    }
    if (userConns.length === 0) {
      this.connections.delete(userId);
      eventBus.removeAllUserListeners(userId);
      try {
        userService.setStatus(userId, 'offline');
      } catch (e) {}
    }
  }

  getUserConnections(userId: string): WSConnection[] {
    return this.connections.get(userId) || [];
  }

  isOnline(userId: string): boolean {
    const conns = this.connections.get(userId);
    return !!conns && conns.length > 0;
  }

  sendToUser(userId: string, event: WSEvent): void {
    const conns = this.getUserConnections(userId);
    const data = JSON.stringify(event);
    for (const conn of conns) {
      if (conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(data);
      }
    }
  }

  private setupUserListeners(userId: string, conn: WSConnection): void {
    const types: WSEventType[] = [
      'new_message',
      'message_delivered',
      'message_read',
      'user_status_changed',
      'typing',
      'group_event',
      'mention',
      'upload_progress',
      'error',
    ];
    for (const type of types) {
      const cb = (event: WSEvent) => {
        if (conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.send(JSON.stringify(event));
        }
      };
      eventBus.onUser(userId, type, cb);
    }
  }

  async handleConnection(connection: SocketStream, request: FastifyRequest): Promise<void> {
    const socket = connection.socket;
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token') || '';
    if (!token) {
      socket.close(1008, 'Missing token');
      return;
    }
    const payload = await authenticateWs(token, this.fastify);
    if (!payload) {
      socket.close(1008, 'Invalid token');
      return;
    }
    const userId = payload.userId;
    this.addConnection(userId, socket);
    try {
      const offline = messageService.getOfflineMessages(userId);
      if (offline.length > 0) {
        const welcomeEvent: WSEvent = {
          type: 'new_message',
          data: { offlineMessages: offline },
          timestamp: Date.now(),
        };
        socket.send(JSON.stringify(welcomeEvent));
      }
      messageService.deliverMessagesForUser(userId);
    } catch (e) {
      console.warn('发送离线消息失败:', e);
    }
    socket.on('message', (raw: Buffer) => {
      this.handleIncoming(userId, raw.toString());
    });
    socket.on('close', () => {
      this.removeConnection(userId, socket);
    });
    socket.on('error', (err) => {
      console.error('WS error for user', userId, err);
      this.removeConnection(userId, socket);
    });
  }

  private handleIncoming(userId: string, raw: string): void {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      eventBus.emitError(userId, '无效的消息格式');
      return;
    }
    try {
      switch (msg.type) {
        case 'ping':
          this.sendToUser(userId, {
            type: 'message_delivered' as WSEventType,
            data: { pong: true, timestamp: Date.now() },
            timestamp: Date.now(),
          });
          break;
        case 'send_message':
          this.handleSendMessage(userId, msg.data);
          break;
        case 'mark_read':
          this.handleMarkRead(userId, msg.data);
          break;
        case 'typing':
          this.handleTyping(userId, msg.data);
          break;
        case 'message_delivered':
          this.handleMessageDelivered(userId, msg.data);
          break;
        default:
          eventBus.emitError(userId, `未知的消息类型: ${msg.type}`);
      }
    } catch (e: any) {
      eventBus.emitError(userId, e.message || '处理失败');
    }
  }

  private handleSendMessage(userId: string, data: any): void {
    if (!data || !data.conversationId || !data.type || !data.content) {
      throw new Error('缺少必要参数: conversationId, type, content');
    }
    const message = messageService.sendMessage({
      conversationId: data.conversationId,
      senderId: userId,
      type: data.type,
      content: data.content,
      metadata: data.metadata,
      replyTo: data.replyTo,
      mentions: data.mentions,
    });
  }

  private handleMarkRead(userId: string, data: any): void {
    if (!data || !data.conversationId) {
      throw new Error('缺少 conversationId');
    }
    messageService.markRead(data.conversationId, userId);
  }

  private handleTyping(userId: string, data: any): void {
    if (!data || !data.conversationId) return;
    const conv = conversationService.getConversation(data.conversationId);
    conversationService.ensureMember(conv, userId);
    const user = userService.getProfile(userId);
    const isTyping = !!data.isTyping;
    const memberIds = conv.members
      .map((m) => m.userId)
      .filter((id) => id !== userId);
    for (const targetId of memberIds) {
      eventBus.emitToUser(targetId, 'typing', {
        conversationId: data.conversationId,
        userId,
        username: user.username,
        isTyping,
      });
    }
  }

  private handleMessageDelivered(userId: string, data: any): void {
    if (!data || !data.messageId) return;
    messageService.updateMessageStatus(data.messageId, 'delivered', userId);
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.connections.keys());
  }
}

export const wsManager = new WebSocketManager();

export async function registerWebSocket(fastify: FastifyInstance): Promise<void> {
  wsManager.init(fastify);
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection: SocketStream, request: FastifyRequest) => {
      wsManager.handleConnection(connection, request);
    });
  });
}
