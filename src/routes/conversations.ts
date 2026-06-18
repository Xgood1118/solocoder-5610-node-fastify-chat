import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { conversationService } from '../services/conversationService';
import { authenticate, getCurrentUser } from '../auth';

export async function conversationRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getCurrentUser(request).userId;
      const conversations = conversationService.getUserConversations(userId);
      const unreadCounts = conversationService.getUnreadCounts(userId);
      return reply.send({ conversations, unreadCounts });
    }
  );

  fastify.post(
    '/private',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const body = (request.body || {}) as any;
        const targetUserId = body.userId as string;
        if (!targetUserId) {
          return reply.code(400).send({ error: '目标用户ID不能为空' });
        }
        const conversation = conversationService.getOrCreatePrivate(userId, targetUserId);
        return reply.code(201).send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.post(
    '/group',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const body = (request.body || {}) as any;
        const { name, memberIds, avatar, description } = body;
        if (!name || !memberIds) {
          return reply.code(400).send({ error: '群名称和成员列表不能为空' });
        }
        const conversation = conversationService.createGroup(
          userId,
          name as string,
          memberIds as string[],
          avatar as string | undefined,
          description as string | undefined
        );
        return reply.code(201).send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.get(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const conv = conversationService.getConversation(params.id as string);
        conversationService.ensureMember(conv, userId);
        return reply.send({ conversation: conv });
      } catch (e: any) {
        return reply.code(404).send({ error: e.message });
      }
    }
  );

  fastify.put(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const conversation = conversationService.updateGroup(
          params.id as string,
          userId,
          (request.body || {}) as any
        );
        return reply.send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.delete(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        conversationService.dismissGroup(params.id as string, userId);
        return reply.send({ success: true });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.post(
    '/:id/members',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const body = (request.body || {}) as any;
        const userIds = (body.userIds || []) as string[];
        const conversation = conversationService.addMembers(params.id as string, userId, userIds);
        return reply.send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.delete(
    '/:id/members',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const body = (request.body || {}) as any;
        const targetUserId = body.userId as string;
        if (!targetUserId) {
          return reply.code(400).send({ error: '目标用户ID不能为空' });
        }
        const conversation = conversationService.removeMember(
          params.id as string,
          userId,
          targetUserId
        );
        return reply.send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.post(
    '/:id/leave',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const conversation = conversationService.leaveGroup(params.id as string, userId);
        return reply.send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.post(
    '/:id/admin',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const params = request.params as any;
        const body = (request.body || {}) as any;
        const targetUserId = body.userId as string;
        const isAdmin = !!body.isAdmin;
        if (!targetUserId) {
          return reply.code(400).send({ error: '目标用户ID不能为空' });
        }
        const conversation = conversationService.setAdmin(
          params.id as string,
          userId,
          targetUserId,
          isAdmin
        );
        return reply.send({ conversation });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );
}
