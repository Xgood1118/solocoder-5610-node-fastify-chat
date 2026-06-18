import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/userService';
import { authenticate, getCurrentUser } from '../auth';
import { UserStatus } from '../types';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.put(
    '/profile',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const user = userService.updateProfile(userId, (request.body || {}) as any);
        return reply.send({ user });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.put(
    '/status',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const body = (request.body || {}) as any;
        const status = body.status as UserStatus;
        if (!['online', 'offline', 'dnd', 'invisible'].includes(status)) {
          return reply.code(400).send({ error: '无效的状态' });
        }
        const user = userService.setStatus(userId, status);
        return reply.send({ user });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );

  fastify.get(
    '/search',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const q = query.q as string;
      const limit = query.limit as number | undefined;
      if (!q) {
        return reply.code(400).send({ error: '搜索关键词不能为空' });
      }
      const users = userService.searchUsers(q, limit || 20);
      return reply.send({ users });
    }
  );

  fastify.get(
    '/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as any;
        const user = userService.getProfile(params.id as string);
        return reply.send({ user });
      } catch (e: any) {
        return reply.code(404).send({ error: e.message });
      }
    }
  );
}
