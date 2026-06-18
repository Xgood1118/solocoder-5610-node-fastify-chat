import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { messageService } from '../services/messageService';
import { authenticate, getCurrentUser } from '../auth';

export async function messageRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const body = (request.body || {}) as any;
        const { conversationId, type, content, metadata, replyTo, mentions } = body;
        if (!conversationId || !type || !content) {
          return reply.code(400).send({ error: '缺少必要参数' });
        }
        const message = messageService.sendMessage({
          conversationId,
          senderId: userId,
          type,
          content,
          metadata,
          replyTo,
          mentions,
        });
        return reply.code(201).send({ message });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.get(
    '/:conversationId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const query = request.query as any;
        const conversationId = params.conversationId as string;
        const before = query.before ? parseInt(query.before as string, 10) : undefined;
        const limit = (query.limit as number) || 50;
        const messages = messageService.getHistory(
          conversationId,
          userId,
          before,
          limit
        );
        return reply.send({ messages });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.post(
    '/:conversationId/read',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const conversationId = params.conversationId as string;
        const messageIds = messageService.markRead(conversationId, userId);
        return reply.send({ readCount: messageIds.length, messageIds });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.get(
    '/offline/list',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getCurrentUser(request).userId;
      const offline = messageService.getOfflineMessages(userId);
      return reply.send({ offlineMessages: offline });
    }
  );
}
